// Private installer transaction boundary. Callers provide planned source/target
// operations; this module owns identity pinning, preflight, staging, CAS commit,
// rollback and final verification. It has no public CLI or runtime side effects.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

const { constants } = fs;

function failure(message, code = "E_INSTALL_DRIFT") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function statType(stat) {
  if (!stat) return "missing";
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isDirectory()) return "directory";
  if (stat.isFile() && stat.nlink > 1n) return "hardlink";
  if (stat.isFile()) return "file";
  if (typeof stat.isFIFO === "function" && stat.isFIFO()) return "special (FIFO)";
  if (typeof stat.isSocket === "function" && stat.isSocket()) return "special (socket)";
  if (typeof stat.isCharacterDevice === "function" && stat.isCharacterDevice()) return "special (character device)";
  if (typeof stat.isBlockDevice === "function" && stat.isBlockDevice()) return "special (block device)";
  return "special";
}

function regular(stat) {
  return Boolean(stat && stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1n);
}

function safeLstat(file) {
  try { return { stat: fs.lstatSync(file, { bigint: true }), error: null }; }
  catch (error) { return error?.code === "ENOENT" ? { stat: null, error: null } : { stat: null, error }; }
}

function identity(stat) { return `${stat.dev}:${stat.ino}`; }

function state(file) {
  const result = safeLstat(file);
  if (result.error) throw result.error;
  if (!result.stat) return null;
  if (!regular(result.stat)) throw failure(`tipo inseguro ${statType(result.stat)}: ${file}`);
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW || 0);
  const fd = fs.openSync(file, flags);
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!regular(opened) || identity(opened) !== identity(result.stat)) throw failure(`identidade alterada: ${file}`);
    const hash = createHash("sha256").update(fs.readFileSync(fd)).digest("hex");
    const after = fs.fstatSync(fd, { bigint: true });
    const named = safeLstat(file);
    if (named.error || !named.stat || !regular(after) || !regular(named.stat) || identity(named.stat) !== identity(opened) || identity(after) !== identity(opened) || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs) {
      throw failure(`arquivo alterado durante leitura: ${file}`);
    }
    return { hash, id: identity(opened) };
  } finally { fs.closeSync(fd); }
}

function assertState(file, expected) {
  const actual = state(file);
  if (actual?.hash !== expected?.hash || actual?.id !== expected?.id) throw failure(`conflito concorrente em ${file}`);
}
function stateWithLinkCount(file, links) {
  const result = safeLstat(file);
  if (result.error) throw result.error;
  if (!result.stat || !result.stat.isFile() || result.stat.isSymbolicLink() || result.stat.nlink !== links) throw failure(`alias inseguro ${file}`);
  const fd = fs.openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.isSymbolicLink() || opened.nlink !== links || identity(opened) !== identity(result.stat)) throw failure(`identidade alias alterada: ${file}`);
    const hash = createHash("sha256").update(fs.readFileSync(fd)).digest("hex");
    const after = fs.fstatSync(fd, { bigint: true });
    const named = safeLstat(file);
    if (named.error || !named.stat || named.stat.nlink !== links || identity(after) !== identity(opened) || after.size !== opened.size || after.mtimeNs !== opened.mtimeNs || identity(named.stat) !== identity(opened)) throw failure(`alias alterado durante leitura: ${file}`);
    return { hash, id: identity(opened) };
  } finally { fs.closeSync(fd); }
}

function restoreQuarantine(operation, checkTransaction) {
  if (!operation.previous || !operation.quarantine) return;
  const targetPath = operation.parentHandle?.target ?? operation.target;
  checkTransaction();
  assertState(operation.quarantine, operation.previous);
  const target = safeLstat(targetPath);
  if (target.error) throw target.error;
  if (target.stat) throw failure(`destino estrangeiro preservado: ${operation.target}`);
  fs.linkSync(operation.quarantine, targetPath);
  checkTransaction();
  const quarantine = stateWithLinkCount(operation.quarantine, 2n);
  const restored = stateWithLinkCount(targetPath, 2n);
  if (
    quarantine.id !== operation.previous.id || quarantine.hash !== operation.previous.hash ||
    restored.id !== operation.previous.id || restored.hash !== operation.previous.hash
  ) throw failure(`quarentena alterada: ${operation.quarantine}`);
  fs.unlinkSync(operation.quarantine);
  assertState(targetPath, operation.previous);
}
function removeOwnedPublication(operation, index, transaction) {
  const expected = operation.installed ?? operation.staged;
  const targetPath = operation.parentHandle?.target ?? operation.target;
  const stage = safeLstat(operation.stage);
  const target = safeLstat(targetPath);
  if (stage.error) throw stage.error;
  if (target.error) throw target.error;
  if (stage.stat && target.stat) {
    const targetAlias = stateWithLinkCount(targetPath, 2n);
    const stageAlias = stateWithLinkCount(operation.stage, 2n);
    if (
      targetAlias.id !== stageAlias.id
      || targetAlias.id !== expected.id
      || targetAlias.hash !== expected.hash
      || stageAlias.hash !== expected.hash
    ) throw failure(`alias próprio não comprovado: ${operation.target}`);
    fs.unlinkSync(targetPath);
    fs.unlinkSync(operation.stage);
    return;
  }
  if (stage.stat) {
    if (target.stat) throw failure(`destino próprio ambíguo: ${operation.target}`);
    assertState(operation.stage, operation.staged);
    fs.unlinkSync(operation.stage);
    return;
  }
  if (!target.stat) return;
  const targetState = state(targetPath);
  if (targetState.hash !== expected.hash || targetState.id !== expected.id) throw failure(`destino estrangeiro preservado: ${operation.target}`);
  const orphan = path.join(transaction, `${index}-${path.basename(operation.target)}.foreign`);
  fs.linkSync(targetPath, orphan);
  try {
    const linked = stateWithLinkCount(targetPath, 2n);
    const retained = stateWithLinkCount(orphan, 2n);
    if (linked.id !== expected.id || linked.hash !== expected.hash || retained.id !== expected.id || retained.hash !== expected.hash) {
      throw failure(`alias de rollback alterado: ${operation.target}`);
    }
  } catch (error) {
    throw failure(`${error.message}; destino estrangeiro preservado: ${operation.target}`);
  }
  fs.unlinkSync(targetPath);
}

function confined(home, target) {
  const rel = path.relative(path.resolve(home), path.resolve(target));
  if (rel === "") return;
  if (rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw failure(`fora do HOME controlado: ${target}`);
}

function ancestorConflict(home, target) {
  let current = path.resolve(target);
  const root = path.resolve(home);
  while (true) {
    const result = safeLstat(current);
    if (result.error) return { kind: "inacessível", path: current, error: result.error };
    if (result.stat && (result.stat.isSymbolicLink() || !result.stat.isDirectory())) {
      return { kind: result.stat.isSymbolicLink() ? "symlink/junction" : statType(result.stat), path: current };
    }
    if (current === root) return null;
    const parent = path.dirname(current);
    if (parent === current || !current.startsWith(`${root}${path.sep}`)) return { kind: "fora da raiz", path: current };
    current = parent;
  }
}

function nearestExisting(target) {
  let current = path.resolve(target);
  while (true) {
    const result = safeLstat(current);
    if (result.stat || result.error) return { path: current, ...result };
    const parent = path.dirname(current);
    if (parent === current) return { path: current, stat: null, error: failure("ancestral ausente") };
    current = parent;
  }
}

function contentState(operation) {
  if (operation.content === undefined) return null;
  if (!Buffer.isBuffer(operation.content) && !(operation.content instanceof Uint8Array)) {
    throw new TypeError("content must be a Buffer or Uint8Array");
  }
  const content = Buffer.from(operation.content);
  return { content, hash: createHash("sha256").update(content).digest("hex") };
}

function desiredHash(operation) {
  return operation.contentState?.hash ?? operation.sourceState?.hash;
}
// Source confinement is rechecked before each source read/copy; hostile swaps after
// the final check remain outside the bounded POSIX guarantee.
function assertSourceScope(source, scopes) {
  if (!Array.isArray(scopes) || scopes.length === 0) throw failure(`origem sem escopo confiável: ${source}`);
  const candidate = path.resolve(source);
  const lexicalAccepted = scopes.some(scope => {
    const base = path.resolve(scope);
    return candidate === base || candidate.startsWith(`${base}${path.sep}`);
  });
  if (!lexicalAccepted) throw failure(`origem fora dos escopos confiáveis: ${source}`);

  const candidateResult = safeLstat(candidate);
  if (candidateResult.error) throw candidateResult.error;
  if (!candidateResult.stat) throw failure(`origem ausente: ${source}`);
  let current = candidate;
  while (true) {
    const result = safeLstat(current);
    if (result.error) throw result.error;
    if (!result.stat) throw failure(`origem ausente: ${source}`);
    if (result.stat.isSymbolicLink()) throw failure(`ancestral simbólico recusado: ${current}`);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  let candidateReal;
  try {
    candidateReal = fs.realpathSync.native(candidate);
  } catch (error) {
    throw failure(`origem não pôde ser canonicalizada: ${source} (${error.message})`);
  }
  const canonicalAccepted = scopes.some(scope => {
    const base = path.resolve(scope);
    const scopeResult = safeLstat(base);
    if (scopeResult.error) throw scopeResult.error;
    if (!scopeResult.stat || scopeResult.stat.isSymbolicLink()) return false;
    let baseReal;
    try {
      baseReal = fs.realpathSync.native(base);
    } catch (error) {
      throw failure(`escopo não pôde ser canonicalizado: ${scope} (${error.message})`);
    }
    if (scopeResult.stat.isFile()) return candidate === base && candidateReal === baseReal;
    if (!scopeResult.stat.isDirectory()) return false;
    return candidateReal === baseReal || candidateReal.startsWith(`${baseReal}${path.sep}`);
  });
  if (!canonicalAccepted) throw failure(`origem fora dos escopos confiáveis: ${source}`);
}

function assertSource(operation, sourceScopes = []) {
  if (operation.contentState) return;
  assertSourceScope(operation.source, sourceScopes);
  assertState(operation.source, operation.sourceState);
}

function capture(operations, home, sourceScopes) {
  return operations.map(operation => {
    confined(home, operation.target);
    if (operation.directory) return { ...operation };
    const generated = contentState(operation);
    const previous = Object.hasOwn(operation, "expectedTarget")
      ? (operation.expectedTarget?.exists ? { hash: operation.expectedTarget.hash, id: operation.expectedTarget.id } : null)
      : state(operation.target);
    if (generated) return { ...operation, contentState: generated, previous };
    assertSourceScope(operation.source, sourceScopes);
    const sourceState = state(operation.source);
    if (!sourceState) throw failure(`origem ausente: ${operation.source}`);
    return { ...operation, sourceState, previous };
  });
}

function assertExpectedParent(operation, created = []) {
  if (!operation.expectedParent) return;
  const expected = operation.expectedParent;
  const parent = nearestExisting(path.dirname(operation.target));
  if (parent.error || !parent.stat?.isDirectory() || parent.stat.isSymbolicLink()) throw failure(`ancestral alterado: ${operation.target}`);
  if (parent.path === expected.path && identity(parent.stat) === expected.id) return;
  const ownParent = created.find(item => item.path === parent.path && item.id === identity(parent.stat));
  const expectedPath = path.resolve(expected.path);
  const actualPath = path.resolve(parent.path);
  if (!ownParent || !(actualPath === expectedPath || actualPath.startsWith(`${expectedPath}${path.sep}`))) {
    throw failure(`ancestral alterado: ${operation.target}`);
  }
}
function parentAnchor(operation, created = []) {
  const parent = nearestExisting(path.dirname(operation.target));
  if (
    parent.error
    || !parent.stat?.isDirectory()
    || parent.stat.isSymbolicLink()
  ) throw failure(`ancestral alterado: ${operation.target}`);
  assertExpectedParent(operation, created);
  return { path: parent.path, id: identity(parent.stat) };
}

function assertParentAnchor(operation, anchor) {
  const parent = nearestExisting(path.dirname(operation.target));
  if (
    parent.error
    || !parent.stat?.isDirectory()
    || parent.stat.isSymbolicLink()
    || parent.path !== anchor.path
    || identity(parent.stat) !== anchor.id
  ) throw failure(`ancestral alterado: ${operation.target}`);
}
function openParentHandle(operation, anchor, owned) {
  const descriptorRoot = process.platform === "linux"
    ? "/proc/self/fd"
    : process.platform === "darwin"
      ? "/dev/fd"
      : null;
  if (!descriptorRoot || !constants.O_DIRECTORY || !constants.O_NOFOLLOW) {
    throw failure(`primitiva descriptor-relativa indisponível: ${operation.target}`);
  }
  let fd;
  try {
    fd = fs.openSync(anchor.path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isDirectory() || opened.isSymbolicLink() || identity(opened) !== anchor.id) {
      throw failure(`ancestral alterado: ${operation.target}`);
    }
    const descriptorPath = path.join(descriptorRoot, String(fd));
    const resolved = fs.realpathSync.native(descriptorPath);
    const resolvedStat = fs.lstatSync(resolved, { bigint: true });
    if (
      !resolvedStat.isDirectory()
      || resolvedStat.isSymbolicLink()
      || identity(resolvedStat) !== anchor.id
    ) throw failure(`ancestral descriptor divergente: ${operation.target}`);
    const name = path.basename(path.resolve(operation.target));
    if (!name || name === "." || name === ".." || name.includes(path.sep)) {
      throw failure(`destino inválido: ${operation.target}`);
    }
    const handle = { fd, path: descriptorPath, target: path.join(descriptorPath, name) };
    owned.add(fd);
    return handle;
  } catch (error) {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    throw error;
  }
}

function closeParentHandles(owned) {
  const errors = [];
  for (const fd of owned) {
    try { fs.closeSync(fd); } catch (error) { errors.push(error); }
  }
  owned.clear();
  if (errors.length) throw failure(`fechamento de descriptor falhou: ${errors[0].message}`);
}


function assertMissing(file, label = file) {
  const result = safeLstat(file);
  if (result.error) throw result.error;
  if (result.stat) throw failure(`reserva estrangeira: ${label}`);
}

function recoverRenamedTarget(operation, anchor, handle) {
  if (!operation.quarantine || !operation.previous) return false;
  if (handle) {
    const opened = fs.fstatSync(handle.fd, { bigint: true });
    if (!opened.isDirectory() || opened.isSymbolicLink() || identity(opened) !== anchor.id) {
      throw failure(`ancestral descriptor alterado: ${operation.target}`);
    }
  } else {
    assertParentAnchor(operation, anchor);
  }
  const targetPath = handle?.target ?? operation.target;
  const moved = safeLstat(operation.quarantine);
  const target = safeLstat(targetPath);
  if (moved.error) throw moved.error;
  if (target.error) throw target.error;
  if (moved.stat && target.stat && moved.stat.nlink === 2n && target.stat.nlink === 2n) {
    const retained = stateWithLinkCount(operation.quarantine, 2n);
    const named = stateWithLinkCount(targetPath, 2n);
    if (retained.id === operation.previous.id && retained.hash === operation.previous.hash && named.id === retained.id && named.hash === retained.hash) {
      fs.unlinkSync(operation.quarantine);
      assertState(targetPath, operation.previous);
      return true;
    }
  }
  if (!moved.stat || target.stat || !regular(moved.stat)) return false;
  const movedState = state(operation.quarantine);
  if (movedState.id !== operation.previous.id || movedState.hash !== operation.previous.hash) {
    throw failure(`quarentena estrangeira preservada: ${operation.quarantine}`);
  }
  fs.linkSync(operation.quarantine, targetPath);
  const linkedTarget = stateWithLinkCount(targetPath, 2n);
  const linkedQuarantine = stateWithLinkCount(operation.quarantine, 2n);
  if (
    linkedTarget.id !== movedState.id
    || linkedTarget.hash !== movedState.hash
    || linkedQuarantine.id !== movedState.id
    || linkedQuarantine.hash !== movedState.hash
  ) throw failure(`restauração insegura: ${operation.target}`);
  fs.unlinkSync(operation.quarantine);
  const restored = state(targetPath);
  if (restored.id !== movedState.id || restored.hash !== movedState.hash) {
    throw failure(`restauração divergente: ${operation.target}`);
  }
  return true;
}


function assertExpectedTarget(operation) {
  if (!Object.hasOwn(operation, "expectedTarget")) return;
  const expected = operation.expectedTarget;
  const actual = safeLstat(operation.target);
  if (actual.error) throw actual.error;
  if (Boolean(actual.stat) !== Boolean(expected?.exists)) throw failure(`destino alterado: ${operation.target}`);
  if (!actual.stat) return;
  if (operation.directory) {
    if (!actual.stat.isDirectory() || actual.stat.isSymbolicLink() || identity(actual.stat) !== expected.id) throw failure(`destino alterado: ${operation.target}`);
    return;
  }
  const current = state(operation.target);
  if (current.id !== expected.id || current.hash !== expected.hash) throw failure(`destino alterado: ${operation.target}`);
}


function inspectTargetsPosix(operations, home) {
  if (!Array.isArray(operations)) throw new TypeError("operations must be an array");
  return {
    ok: true,
    targets: operations.map(operation => {
      if (!operation || typeof operation !== "object" || typeof operation.target !== "string") throw new TypeError("inspection operations must declare target");
      const directory = Boolean(operation.directory);
      const { target } = operation;
      confined(home, target);
      const parent = nearestExisting(path.dirname(target));
      if (parent.error || !parent.stat?.isDirectory() || parent.stat.isSymbolicLink()) throw failure(`ancestral inseguro: ${target}`);
      const targetResult = safeLstat(target);
      if (targetResult.error) throw targetResult.error;
      let value = null;
      if (targetResult.stat) {
        if (directory) {
          if (!targetResult.stat.isDirectory() || targetResult.stat.isSymbolicLink()) throw failure(`tipo inseguro ${statType(targetResult.stat)}: ${target}`);
          value = { id: identity(targetResult.stat) };
        } else {
          value = state(target);
        }
      }
      return {
        target,
        exists: Boolean(value),
        hash: directory ? null : value?.hash ?? null,
        id: value?.id ?? null,
        parent: { path: parent.path, id: identity(parent.stat) },
      };
    }),
  };
}
function preflight(operations, home) {
  const transactionParent = nearestExisting(path.join(home, ".omp", "install-transactions"));
  if (transactionParent.error || !transactionParent.stat?.isDirectory()) return { target: transactionParent.path, error: transactionParent.error ?? failure("transaction parent is not a directory") };
  const checked = new Set();
  for (const operation of operations) {
    const target = path.resolve(operation.target);
    const parentConflict = ancestorConflict(home, operation.directory ? target : path.dirname(target));
    if (parentConflict) return { target: parentConflict.path, error: failure(`${parentConflict.kind}: ${parentConflict.path}`) };
    if (!operation.directory && !operation.contentState) {
      const source = safeLstat(operation.source);
      if (source.error || !regular(source.stat)) return { target: operation.source, error: source.error ?? failure("source must be a regular file") };
      try { fs.accessSync(operation.source, constants.R_OK); } catch (error) { return { target: operation.source, error }; }
    }
    const targetResult = safeLstat(target);
    if (targetResult.error) return { target, error: targetResult.error };
    if (operation.directory && targetResult.stat?.isDirectory()) continue;
    if (targetResult.stat && !operation.directory) {
      if (!regular(targetResult.stat)) return { target, error: failure(`tipo inseguro ${statType(targetResult.stat)}: ${target}`) };
      const contentUnchanged = operation.previous?.hash === desiredHash(operation);
      if (!operation.verify && !contentUnchanged) {
        try { fs.accessSync(target, constants.W_OK); } catch (error) { return { target, error }; }
      }
    }
    const parent = nearestExisting(path.dirname(target));
    if (parent.stat.dev !== transactionParent.stat.dev) return { target, error: failure("staging e destino em dispositivos diferentes: EXDEV") };
    if (!checked.has(parent.path)) {
      try { fs.accessSync(parent.path, constants.W_OK | constants.X_OK); } catch (error) { return { target: parent.path, error }; }
      checked.add(parent.path);
    }
  }
  return null;
}

function removeEmptyDirectories(created) {
  const conflicts = [];
  for (const item of [...created].reverse()) {
    try {
      const current = safeLstat(item.path);
      if (current.error) throw current.error;
      if (!current.stat) continue;
      if (identity(current.stat) !== item.id || !current.stat.isDirectory() || current.stat.isSymbolicLink()) {
        conflicts.push(`${item.path}: diretório concorrente preservado`);
        continue;
      }
      if (fs.readdirSync(item.path).length === 0) fs.rmdirSync(item.path);
      else conflicts.push(`${item.path}: diretório não vazio preservado`);
    } catch (error) {
      conflicts.push(`${item.path}: ${error.message}`);
    }
  }
  return conflicts;
}

function applyPosix(operations, home, sourceScopes = []) {
  const created = [];
  const applied = [];
  const ownedParentFds = new Set();
  let transaction;
  let retainedBackup = false;
  let committed = false;
  let transactionId;
  const checkTransaction = () => {
    const conflict = ancestorConflict(home, transaction);
    const result = safeLstat(transaction);
    if (conflict || result.error || !result.stat?.isDirectory() || identity(result.stat) !== transactionId) {
      throw failure(`staging alterado: ${transaction}`);
    }
  };
  try {
    for (const operation of operations) {
      assertExpectedParent(operation);
      const conflict = ancestorConflict(home, operation.directory ? operation.target : path.dirname(operation.target));
      if (conflict) throw failure(`${conflict.kind}: ${conflict.path}`);
      if (!operation.directory) {
        assertSource(operation, sourceScopes);
        assertState(operation.target, operation.previous);
      }
    }
    const transactionRoot = path.join(home, ".omp", "install-transactions");
    const transactionConflict = ancestorConflict(home, transactionRoot);
    if (transactionConflict) throw failure(`${transactionConflict.kind}: ${transactionConflict.path}`);
    fs.mkdirSync(transactionRoot, { recursive: true });
    transaction = fs.mkdtempSync(path.join(transactionRoot, "install-"));
    transactionId = identity(fs.lstatSync(transaction, { bigint: true }));
    const ensureDirectory = directory => {
      confined(home, directory);
      const conflict = ancestorConflict(home, directory);
      if (conflict) throw failure(`${conflict.kind}: ${conflict.path}`);
      const existing = safeLstat(directory);
      if (existing.error) throw existing.error;
      if (existing.stat) {
        if (!existing.stat.isDirectory() || existing.stat.isSymbolicLink()) throw failure(`tipo inseguro ${statType(existing.stat)}: ${directory}`);
        return;
      }
      if (path.resolve(directory) !== path.resolve(home)) ensureDirectory(path.dirname(directory));
      fs.mkdirSync(directory);
      created.push({ path: directory, id: identity(fs.lstatSync(directory, { bigint: true })) });
    };

    let index = 0;
    for (const operation of operations) {
      if (operation.directory || operation.verify) continue;
      checkTransaction();
      assertSource(operation, sourceScopes);
      operation.stage = path.join(transaction, `${index}.stage`);
      if (operation.contentState) fs.writeFileSync(operation.stage, operation.contentState.content, { flag: "wx" });
      else fs.copyFileSync(operation.source, operation.stage, constants.COPYFILE_EXCL);
      if (operation.mode !== undefined) fs.chmodSync(operation.stage, operation.mode);
      operation.staged = state(operation.stage);
      if (operation.staged.hash !== desiredHash(operation)) throw failure(`staging divergente: ${operation.target}`);
      assertSource(operation, sourceScopes);
      if (operation.previous) {
        assertState(operation.target, operation.previous);
        if (operation.retainBackup !== false) retainedBackup = true;
        operation.backup = path.join(transaction, `${index}.backup`);
        fs.copyFileSync(operation.target, operation.backup, constants.COPYFILE_EXCL);
        operation.backedUp = state(operation.backup);
        if (operation.backedUp.hash !== operation.previous.hash) throw failure(`backup divergente: ${operation.target}`);
        assertState(operation.target, operation.previous);
      }
      index += 1;
    }
    for (const operation of operations) {
      if (operation.verify) {
        assertExpectedParent(operation, created);
        assertSource(operation, sourceScopes);
        assertState(operation.target, operation.previous);
        if (desiredHash(operation) !== operation.previous?.hash) {
          throw failure(`plano divergente: ${operation.target}`);
        }
        continue;
      }
      if (operation.directory) {
        assertExpectedTarget(operation);
        assertExpectedParent(operation, created);
        ensureDirectory(operation.target);
        continue;
      }
      checkTransaction();
      assertSource(operation, sourceScopes);
      assertState(operation.stage, operation.staged);
      ensureDirectory(path.dirname(operation.target));
      assertExpectedParent(operation, created);
      assertState(operation.target, operation.previous);
      if (operation.previous) {
        const parent = parentAnchor(operation, created);
        operation.parentAnchor = parent;
        const handle = openParentHandle(operation, parent, ownedParentFds);
        operation.parentHandle = handle;
        operation.quarantine = `${operation.backup}.quarantine`;
        assertMissing(operation.quarantine, operation.quarantine);
        try {
          // link() reserves the name exclusively. rename() would overwrite an
          // entry created by another actor after assertMissing().
          fs.linkSync(handle.target, operation.quarantine);
          const retained = stateWithLinkCount(operation.quarantine, 2n);
          const named = stateWithLinkCount(handle.target, 2n);
          if (retained.id !== operation.previous.id || retained.hash !== operation.previous.hash || named.id !== retained.id || named.hash !== retained.hash) {
            throw failure(`quarentena alterada: ${operation.quarantine}`);
          }
          fs.unlinkSync(handle.target);
          assertParentAnchor(operation, parent);
        } catch (error) {
          try { recoverRenamedTarget(operation, parent, handle); } catch (recoveryError) {
            throw failure(`${error.message}; restauração recusada: ${recoveryError.message}`);
          }
          throw error;
        }
        operation.quarantined = true;
      }
      if (!operation.parentHandle) {
        const parent = parentAnchor(operation, created);
        operation.parentAnchor = parent;
        operation.parentHandle = openParentHandle(operation, parent, ownedParentFds);
      }
      const targetPath = operation.parentHandle.target;
      operation.installed = operation.staged;
      applied.push(operation);
      fs.linkSync(operation.stage, targetPath);
      operation.published = true;
      assertParentAnchor(operation, operation.parentAnchor);
      fs.unlinkSync(operation.stage);
      assertState(targetPath, operation.installed);
      if (operation.installed.hash !== desiredHash(operation)) throw failure(`destino divergente: ${operation.target}`);
    }
    for (const operation of operations) {
      if (operation.parentAnchor) assertParentAnchor(operation, operation.parentAnchor);
      else assertExpectedParent(operation, created);
    }
    committed = true;
    for (const operation of operations) {
      if (operation.directory || operation.retainBackup !== false) continue;
      if (operation.quarantine) {
        assertState(operation.quarantine, operation.previous);
        fs.unlinkSync(operation.quarantine);
      }
      if (operation.backup) {
        assertState(operation.backup, operation.backedUp);
        fs.unlinkSync(operation.backup);
      }
    }
    if (!retainedBackup) fs.rmdirSync(transaction);
    return { ok: true, event: "commit-complete" };
  } catch (error) {
    if (committed) throw failure(`${error.message}; commit irreversível — publicações preservadas; limpeza incompleta`);
    const rollback = [];
    for (const [index, operation] of applied.reverse().entries()) {
      try {
        checkTransaction();
        if (!operation.parentHandle) assertExpectedParent(operation, created);
        if (operation.previous) assertState(operation.quarantine, operation.previous);
        removeOwnedPublication(operation, index, transaction);
        restoreQuarantine(operation, checkTransaction);
        rollback.push(`${operation.target}: restored`);
      } catch (rollbackError) {
        rollback.push(`${operation.target}: ${rollbackError.message}`);
      }
    }
    rollback.push(...removeEmptyDirectories(created));
    throw failure(`${error.message}; rollback ${rollback.length && rollback.every(item => item.endsWith("restored")) ? "concluído (backup retido)" : `parcial — conflitos preservados: ${rollback.join("; ")}`}`);
  } finally {
    closeParentHandles(ownedParentFds);
  }

}
function windowsPowerShellPath() {
  const report = typeof process.report?.getReport === "function" ? process.report.getReport() : null;
  const modules = Array.isArray(report?.sharedObjects) ? report.sharedObjects : [];
  const required = ["ntdll.dll", "kernel32.dll", "kernelbase.dll"];
  const roots = new Map();
  for (const name of required) {
    const item = modules.find(value => path.win32.basename(String(value)).toLowerCase() === name);
    if (!item) throw failure(`Windows TCB ausente: ${name}`);
    const normalized = path.win32.normalize(String(item));
    const match = normalized.match(/^(.*?)[\\\/]System32[\\\/][^\\\/]+$/i);
    if (!match) throw failure(`Windows TCB fora de System32: ${item}`);
    const root = path.win32.normalize(match[1]);
    roots.set(root.toLowerCase(), root);
  }
  if (roots.size !== 1) throw failure("Windows TCB com raízes divergentes");
  const root = [...roots.values()][0];
  const executable = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const stat = fs.lstatSync(executable, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync.native(executable).toLowerCase() !== executable.toLowerCase()) throw failure("Windows PowerShell TCB inválido");
  return { executable, root };
}

const WINDOWS_TRANSACTION = String.raw`
$ErrorActionPreference = 'Stop'
if ([IntPtr]::Size -ne 8 -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $PSEdition -ne 'Desktop' -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { throw 'E_INSTALL_DRIFT: PowerShell TCB incompatível (Desktop/FullLanguage/x64/5.1)' }
$osModules = [IO.Path]::Combine([string]$env:SystemRoot,'System32','WindowsPowerShell','v1.0','Modules')
$env:PSModulePath = $osModules
if ($env:PSModulePath -ne $osModules) { throw 'E_INSTALL_DRIFT: PSModulePath fora do contexto OS protegido' }
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$payload = ([Console]::In.ReadToEnd() | ConvertFrom-Json)
$asmName = [Reflection.AssemblyName]::new('UsefulSkillsFsTransaction')
$asm = [AppDomain]::CurrentDomain.DefineDynamicAssembly($asmName, [Reflection.Emit.AssemblyBuilderAccess]::Run)
$mod = $asm.DefineDynamicModule('UsefulSkillsFsTransaction')
$type = $mod.DefineType('Native', [Reflection.TypeAttributes]::Public -bor [Reflection.TypeAttributes]::Abstract -bor [Reflection.TypeAttributes]::Sealed)
function PInvoke($name,$dll,$returnType,$parameterTypes) {
  $m = $type.DefinePInvokeMethod($name,$dll,[Reflection.MethodAttributes]::Public -bor [Reflection.MethodAttributes]::Static -bor [Reflection.MethodAttributes]::PinvokeImpl,[Reflection.CallingConventions]::Standard,$returnType,$parameterTypes,[Runtime.InteropServices.CallingConvention]::Winapi,[Runtime.InteropServices.CharSet]::Unicode)
  $m.SetImplementationFlags($m.GetMethodImplementationFlags() -bor [Reflection.MethodImplAttributes]::PreserveSig)
}
PInvoke 'NtCreateFile' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr],[uint32],[IntPtr],[IntPtr],[IntPtr],[uint32],[uint32],[uint32],[uint32],[IntPtr],[uint32]))
PInvoke 'NtQueryInformationFile' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr],[IntPtr],[IntPtr],[uint32],[int]))
PInvoke 'NtQueryDirectoryFile' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr],[IntPtr],[IntPtr],[IntPtr],[IntPtr],[IntPtr],[uint32],[int],[bool],[IntPtr],[bool]))
PInvoke 'NtSetInformationFile' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr],[IntPtr],[IntPtr],[uint32],[int]))
PInvoke 'NtClose' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr]))
$native = $type.CreateType()
$allHandles = [Collections.Generic.List[IntPtr]]::new()
$directoryCache = @{}
$directoryCreationLedger = $null
function Fail($message) { throw ('E_INSTALL_DRIFT: ' + $message) }
function CheckStatus($status,$what) { if ([int]$status -lt 0) { $masked = ([int64]$status -band 0xffffffffL); Fail ($what + ' status 0x{0:X8}' -f $masked) } }
function EnsureTarget([string]$full) {
  $candidate = [IO.Path]::GetFullPath($full); $base = [IO.Path]::GetFullPath([string]$payload.home)
  if (-not [IO.Path]::IsPathRooted($full) -or -not $candidate.StartsWith($base.TrimEnd('\') + '\',[StringComparison]::OrdinalIgnoreCase)) { Fail ('destino fora do HOME: ' + $full) }
}
function EnsureSource([string]$full) {
  $candidate = [IO.Path]::GetFullPath($full)
  if (-not [IO.Path]::IsPathRooted($full)) { Fail ('origem não absoluta: ' + $full) }
  $accepted = $false
  foreach ($scope in $payload.sourceScopes) {
    $base = [IO.Path]::GetFullPath([string]$scope).TrimEnd('\')
    if ($candidate.Equals($base,[StringComparison]::OrdinalIgnoreCase) -or $candidate.StartsWith($base + '\',[StringComparison]::OrdinalIgnoreCase)) { $accepted = $true; break }
  }
  if (-not $accepted) { Fail ('origem fora dos escopos confiáveis: ' + $full) }
}
function Unicode($text) {
  $bytes = [Text.Encoding]::Unicode.GetBytes([string]$text)
  $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length + 2)
  [Runtime.InteropServices.Marshal]::Copy($bytes,0,$buffer,$bytes.Length)
  $value = [Runtime.InteropServices.Marshal]::AllocHGlobal(16)
  [Runtime.InteropServices.Marshal]::WriteInt16($value,0,[int16]$bytes.Length)
  [Runtime.InteropServices.Marshal]::WriteInt16($value,2,[int16]($bytes.Length + 2))
  [Runtime.InteropServices.Marshal]::WriteIntPtr($value,8,$buffer)
  [pscustomobject]@{ Value = $value; Buffer = $buffer; Length = $bytes.Length; Bytes = $bytes }
}
function Attributes($handle,[bool]$directory) {
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16); $info = [Runtime.InteropServices.Marshal]::AllocHGlobal(32)
  try {
    CheckStatus ($native::NtQueryInformationFile($handle,$ios,$info,8,35)) 'NtQueryInformationFile(FileAttributeTagInformation)'
    $attr = [Runtime.InteropServices.Marshal]::ReadInt32($info,0)
    if (($attr -band 0x400) -ne 0) { Fail 'reparse point/junction recusado' }
    if (-not $directory) {
      CheckStatus ($native::NtQueryInformationFile($handle,$ios,$info,24,5)) 'NtQueryInformationFile(FileStandardInformation)'
      if ([Runtime.InteropServices.Marshal]::ReadInt32($info,16) -ne 1) { Fail 'hardlink/nlink divergente' }
    }
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($info) }
}
function Identity($handle) {
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16); $info = [Runtime.InteropServices.Marshal]::AllocHGlobal(32)
  try {
    CheckStatus ($native::NtQueryInformationFile($handle,$ios,$info,32,59)) 'NtQueryInformationFile(FileIdInformation)'
    # Exact identity tuple: 8-byte volume serial followed by FILE_ID_128 (16 bytes).
    $bytes = [byte[]]::new(24); [Runtime.InteropServices.Marshal]::Copy($info,$bytes,0,24)
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($info) }
}
function FindChild($directory,[string]$name) {
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16); $buffer = [Runtime.InteropServices.Marshal]::AllocHGlobal(65536)
  try {
    $restart = $true
    while ($true) {
      $status = $native::NtQueryDirectoryFile($directory,[IntPtr]::Zero,[IntPtr]::Zero,[IntPtr]::Zero,$ios,$buffer,65536,12,$false,[IntPtr]::Zero,$restart)
      if (([int64]$status -band 0xffffffffL) -eq 2147483654) { return $false }
      CheckStatus $status 'NtQueryDirectoryFile(FileNamesInformation)'
      $offset = 0
      while ($true) {
        $next = [Runtime.InteropServices.Marshal]::ReadInt32($buffer,$offset)
        $length = [Runtime.InteropServices.Marshal]::ReadInt32($buffer,$offset + 8)
        $candidate = [Runtime.InteropServices.Marshal]::PtrToStringUni([IntPtr]::Add($buffer,$offset + 12),[int]($length / 2))
        if ($candidate -ceq $name) { return $true }
        if ($next -eq 0) { break }
        $offset += $next
      }
      $restart = $false
    }
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($buffer) }
}
function ObjectAttributes($root,$unicode) {
  $oa = [Runtime.InteropServices.Marshal]::AllocHGlobal(48)
  [Runtime.InteropServices.Marshal]::Copy([byte[]]::new(48),0,$oa,48)
  [Runtime.InteropServices.Marshal]::WriteInt32($oa,0,48)
  [Runtime.InteropServices.Marshal]::WriteIntPtr($oa,8,$root)
  [Runtime.InteropServices.Marshal]::WriteIntPtr($oa,16,$unicode.Value)
  [Runtime.InteropServices.Marshal]::WriteInt32($oa,24,0x40)
  $oa
}
function OpenNative($root,[string]$name,[bool]$directory,[bool]$create,[bool]$write) {
  $u = Unicode $name; $oa = ObjectAttributes $root $u; $out = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size); $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16)
  try {
    $access = if ($directory) { if ($create -or $write) { 0x110081 } else { 0x100081 } } elseif ($write) { 0x13019f } else { 0x120089 }
    $options = 0x200020 -bor $(if ($directory) { 1 } else { 0 })
    $disposition = if ($create) { 2 } else { 1 }
    $share = if ($directory) { 3 } else { 1 }
    $status = $native::NtCreateFile($out,$access,$oa,$ios,[IntPtr]::Zero,0,$share,$disposition,$options,[IntPtr]::Zero,0)
    $role = if ($directory) { if ($create) { 'directory-create' } elseif ($write) { 'directory-owned' } else { 'directory-ancestor' } } elseif ($write) { 'file-target' } else { 'file-source' }
    CheckStatus $status ('NtCreateFile ' + $role + ' [' + $name + ']')
    $handle = [Runtime.InteropServices.Marshal]::ReadIntPtr($out)
    if ($handle -eq [IntPtr]::Zero) { Fail 'NtCreateFile returned null handle' }
    $allHandles.Add($handle); Attributes $handle $directory
    return $handle
  } finally {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($out); [Runtime.InteropServices.Marshal]::FreeHGlobal($oa); [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Value); [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Buffer)
  }
}
function CloseNative($handle) { if ($handle -ne [IntPtr]::Zero) { CheckStatus ($native::NtClose($handle)) 'NtClose'; [void]$allHandles.Remove($handle) } }
function OpenChain([string]$full,[bool]$directory,[bool]$allowMissing,[bool]$create,[bool]$write) {
  if (-not [IO.Path]::IsPathRooted($full)) { Fail ('caminho não absoluto: ' + $full) }
  $absolute = [IO.Path]::GetFullPath($full); $rootPath = [IO.Path]::GetPathRoot($absolute); $rootName = '\??\' + ($rootPath -replace '/','\')
  $rootKey = $rootPath.ToLowerInvariant()
  $rootCached = $directoryCache[$rootKey]
  if ($rootCached) { $parent = $rootCached.Handle } else {
    $parent = OpenNative ([IntPtr]::Zero) $rootName $true $false $false
    $directoryCache[$rootKey] = [pscustomobject]@{ Handle = $parent; Name = $rootPath }
  }
  $parentPath = $rootPath
  $parts = $absolute.Substring($rootPath.Length).Split([IO.Path]::DirectorySeparatorChar,[System.StringSplitOptions]::RemoveEmptyEntries)
  if ($parts.Length -eq 0) { return [pscustomobject]@{ Parent = [IntPtr]::Zero; ParentPath = $null; Name = ''; Handle = $parent; Exists = $true; Directory = $true; Deferred = $false } }
  $prefix = $rootPath.TrimEnd('\')
  for ($i = 0; $i -lt $parts.Length; $i++) {
    $name = $parts[$i]; $last = $i -eq ($parts.Length - 1); $wantDir = if ($last) { $directory } else { $true }
    $prefix = $prefix + '\' + $name
    $key = $prefix.ToLowerInvariant()
    $cached = $directoryCache[$key]
    if ($cached) {
      if ($cached.Name -cne $name) { Fail ('componente não corresponde ao case exato: ' + $name) }
      if ($last -and -not $directory) { Fail ('conflito de tipo no destino: ' + $full) }
      if ($last) { return [pscustomobject]@{ Parent = $parent; ParentPath = $parentPath; Name = $name; Handle = $cached.Handle; Exists = $true; Directory = $directory; Deferred = $false } }
      $parent = $cached.Handle
      $parentPath = $prefix
      continue
    }
    $exists = FindChild $parent $name
    if (-not $exists -and $allowMissing) { return [pscustomobject]@{ Parent = $parent; ParentPath = $parentPath; Name = $name; Handle = [IntPtr]::Zero; Exists = $false; Directory = $directory; Deferred = -not $last } }
    if (-not $exists -and -not ($create -and $wantDir)) { Fail ('componente ausente ou não exato: ' + $name) }
    $child = OpenNative $parent $name $wantDir ($create -and $wantDir -and -not $exists) ($write -and $last)
    if ($wantDir) {
      $entry = [pscustomobject]@{ Handle = $child; Name = $name; Path = $prefix; Created = ($create -and -not $exists) }
      $directoryCache[$key] = $entry
      if ($entry.Created -and $null -ne $directoryCreationLedger) { [void]$directoryCreationLedger.Add($entry) }
    }
    if ($last) { return [pscustomobject]@{ Parent = $parent; ParentPath = $parentPath; Name = $name; Handle = $child; Exists = $true; Directory = $directory; Deferred = $false } }
    $parent = $child
    $parentPath = $prefix
  }
}
function Stream($handle,$write) {
  $safe = [Microsoft.Win32.SafeHandles.SafeFileHandle]::new($handle,$false)
  [IO.FileStream]::new($safe, $(if ($write) { [IO.FileAccess]::ReadWrite } else { [IO.FileAccess]::Read }), 65536, $false)
}
function HashHandle($handle) { Attributes $handle $false; $stream = Stream $handle $false; try { [void]$stream.Seek(0,[IO.SeekOrigin]::Begin); $sha = [Security.Cryptography.SHA256]::Create(); return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','').ToLowerInvariant() } finally { $stream.Dispose() } }
function HashBytes($bytes) { $sha = [Security.Cryptography.SHA256]::Create(); try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose() } }
function RenameHandle($handle,$root,[string]$name) {
  $u = Unicode $name; $size = 20 + $u.Length; $info = [Runtime.InteropServices.Marshal]::AllocHGlobal($size); $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16)
  try {
    [Runtime.InteropServices.Marshal]::Copy([byte[]]::new($size),0,$info,$size); [Runtime.InteropServices.Marshal]::Copy([byte[]]::new(16),0,$ios,16)
    [Runtime.InteropServices.Marshal]::WriteByte($info,0,0); [Runtime.InteropServices.Marshal]::WriteIntPtr($info,8,$root); [Runtime.InteropServices.Marshal]::WriteInt32($info,16,$u.Length); [Runtime.InteropServices.Marshal]::Copy($u.Bytes,0,[IntPtr]::Add($info,20),$u.Length)
    CheckStatus ($native::NtSetInformationFile($handle,$ios,$info,[uint32]$size,10)) 'NtSetInformationFile(FileRenameInformation)'
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($info); [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Value); [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Buffer) }
}
function DeleteHandle($handle) {
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16); $info = [Runtime.InteropServices.Marshal]::AllocHGlobal(4)
  try { [Runtime.InteropServices.Marshal]::WriteInt32($info,0,1); CheckStatus ($native::NtSetInformationFile($handle,$ios,$info,4,13)) 'NtSetInformationFile(FileDispositionInformation)' } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($info) }
}
function CopyHandle($source,$target) {
  $input = Stream $source $false; $output = Stream $target $true
  try { [void]$input.Seek(0,[IO.SeekOrigin]::Begin); [void]$output.Seek(0,[IO.SeekOrigin]::Begin); $input.CopyTo($output); $output.Flush($true) } finally { $input.Dispose(); $output.Dispose() }
}
function WriteBytes($bytes,$target) {
  $output = Stream $target $true
  try { [void]$output.Seek(0,[IO.SeekOrigin]::Begin); $output.Write($bytes,0,$bytes.Length); $output.Flush($true) } finally { $output.Dispose() }
}
$owned = [Collections.Generic.List[object]]::new(); $equal = [Collections.Generic.List[object]]::new(); $directories = [Collections.Generic.List[object]]::new(); $inspection = [Collections.Generic.List[object]]::new(); $tx = $null
$response = $null
$closeFailure = $null
$directoryKeys = @{}
$retainedBackup = $false
$committed = $false
try {
  foreach ($op in $payload.operations) {
    $targetParent = [IO.Path]::GetDirectoryName([IO.Path]::GetFullPath([string]$op.target))
    if ($targetParent) {
      $parentKey = $targetParent.ToLowerInvariant()
      if (-not $directoryKeys.ContainsKey($parentKey)) {
        $parentProbe = OpenChain $targetParent $true $true $false $false
        if (-not $parentProbe.Exists) {
          [void]$directories.Add([pscustomobject]@{ Op = [pscustomobject]@{ directory = $true; target = $targetParent }; Probe = $parentProbe; Handle = [IntPtr]::Zero; Created = $false })
          $directoryKeys[$parentKey] = $true
        }
      }
    }
    EnsureTarget $op.target
    if ($op.directory -and $payload.inspectOnly) {
      $target = OpenChain $op.target $true $true $false $false
      $targetId = if ($target.Exists) { Identity $target.Handle } else { $null }
      $parentId = if ($target.Parent -ne [IntPtr]::Zero) { Identity $target.Parent } else { $null }
      if ($null -ne $op.expectedTarget -and ([bool]$op.expectedTarget.exists -ne [bool]$target.Exists -or ($target.Exists -and [string]$op.expectedTarget.id -ne $targetId))) { Fail ('diretório alterado: ' + $op.target) }
      if ($null -ne $op.expectedParent -and ([string]$op.expectedParent.id -ne $parentId -or -not ([string]$op.expectedParent.path).Equals([string]$target.ParentPath,[StringComparison]::OrdinalIgnoreCase))) { Fail ('ancestral alterado: ' + $op.target) }
      [void]$inspection.Add([pscustomobject]@{ target = [string]$op.target; exists = [bool]$target.Exists; id = $targetId; hash = $null; parent = [pscustomobject]@{ path = [string]$target.ParentPath; id = $parentId } })
      continue
    }
    if ($op.directory) {
      $directoryKey = ([IO.Path]::GetFullPath([string]$op.target)).ToLowerInvariant()
      if (-not $directoryKeys.ContainsKey($directoryKey)) {
        $probe = OpenChain $op.target $true $true $false $false
        $probeId = if ($probe.Exists) { Identity $probe.Handle } else { $null }
        $probeParentId = if ($probe.Parent -ne [IntPtr]::Zero) { Identity $probe.Parent } else { $null }
        if ($null -ne $op.expectedTarget -and ([bool]$op.expectedTarget.exists -ne [bool]$probe.Exists -or ($probe.Exists -and [string]$op.expectedTarget.id -ne $probeId))) { Fail ('diretório alterado: ' + $op.target) }
        if ($null -ne $op.expectedParent -and ([string]$op.expectedParent.id -ne $probeParentId -or -not ([string]$op.expectedParent.path).Equals([string]$probe.ParentPath,[StringComparison]::OrdinalIgnoreCase))) { Fail ('ancestral alterado: ' + $op.target) }
        $dirHandle = [IntPtr]::Zero
        if ($probe.Exists) { $dirHandle = $probe.Handle }
        [void]$directories.Add([pscustomobject]@{ Op = $op; Probe = $probe; Handle = $dirHandle; Created = $false })
        $directoryKeys[$directoryKey] = $true
      }
      continue
    }
    $source = [IntPtr]::Zero
    $sourceId = $null
    if (-not $payload.inspectOnly -and $null -eq $op.contentBase64) {
      EnsureSource $op.source
      $source = OpenChain $op.source $false $false $false $false
      $sourceId = Identity $source.Handle
      $sourceHash = HashHandle $source.Handle
    } elseif ($null -ne $op.contentBase64) {
      $sourceHash = HashBytes ([Convert]::FromBase64String([string]$op.contentBase64))
    } else {
      $sourceHash = $null
    }
    $target = OpenChain $op.target $false $true $false $false
    $targetId = if ($target.Exists) { Identity $target.Handle } else { $null }
    $targetHash = if ($target.Exists) { HashHandle $target.Handle } else { $null }
    $parentId = if ($target.Parent -ne [IntPtr]::Zero) { Identity $target.Parent } else { $null }
    if ($null -ne $op.expectedTarget) {
      if ([bool]$op.expectedTarget.exists -ne [bool]$target.Exists) { Fail ('destino alterado: ' + $op.target) }
      if ($target.Exists -and ([string]$op.expectedTarget.id -ne $targetId -or [string]$op.expectedTarget.hash -ne $targetHash)) { Fail ('destino alterado: ' + $op.target) }
    }
    if ($null -ne $op.expectedParent -and ([string]$op.expectedParent.id -ne $parentId -or -not ([string]$op.expectedParent.path).Equals([string]$target.ParentPath,[StringComparison]::OrdinalIgnoreCase))) { Fail ('ancestral alterado: ' + $op.target) }
    [void]$inspection.Add([pscustomobject]@{ target = [string]$op.target; exists = [bool]$target.Exists; id = $targetId; hash = $targetHash; parent = [pscustomobject]@{ path = [string]$target.ParentPath; id = $parentId } })
    $op.sourceHash = $sourceHash
    $op.previousHash = $targetHash
    if ($op.verify) {
      if (-not $target.Exists) { Fail ('equal ausente: ' + $op.target) }
      if ($targetHash -ne $sourceHash) { Fail ('equal divergente: ' + $op.target) }
      [void]$equal.Add([pscustomobject]@{ Op = $op; Source = $source; Target = $target; SourceId = $sourceId; TargetId = $targetId })
      continue
    }
    if ($target.Exists -and $targetHash -eq $sourceHash) {
      [void]$equal.Add([pscustomobject]@{ Op = $op; Source = $source; Target = $target; SourceId = $sourceId; TargetId = $targetId })
      continue
    }
    if ($target.Exists -and -not $payload.inspectOnly) {
      CloseNative $target.Handle
      $target = OpenChain $op.target $false $false $false $true
      if ((Identity $target.Handle) -ne $targetId -or (HashHandle $target.Handle) -ne $targetHash) { Fail ('destino alterado: ' + $op.target) }
    }
    [void]$owned.Add([pscustomobject]@{ Op = $op; Source = $source; SourceId = $sourceId; Target = $target; TargetId = $targetId; Stage = [IntPtr]::Zero; Previous = $null; Published = $false })
  }
  if ($payload.inspectOnly) {
    foreach ($handle in @($allHandles)) {
      try { CloseNative $handle } catch { if ($null -eq $closeFailure) { $closeFailure = $_.Exception.Message } }
    }
    $response = [ordered]@{ schema = 'fs-transaction.windows.v1'; nonce = [string]$payload.nonce; ok = ($null -eq $closeFailure); operationCount = [int]$payload.operationCount; hostVersion = 'WindowsPowerShell/' + $PSVersionTable.PSVersion.ToString(); architecture = [IntPtr]::Size * 8; event = 'inspect-complete'; inspection = @($inspection) }
    if ($closeFailure) { $response['error'] = $closeFailure }
    [Console]::Out.WriteLine(($response | ConvertTo-Json -Compress -Depth 8))
    if (-not $response.ok) { exit 1 }
    exit 0
  }
  $txPath = [IO.Path]::Combine([string]$payload.home,'.omp','install-transactions','install-' + [Guid]::NewGuid().ToString('N'))
  $tx = OpenChain $txPath $true $false $true $true
  foreach ($record in $owned) {
    if ($record.Source -ne [IntPtr]::Zero) {
      if ((Identity $record.Source.Handle) -ne $record.SourceId) { Fail ('origem alterada: ' + $record.Op.source) }
    }
    if (-not $record.Target.Deferred -and $record.Target.Exists -and ((Identity $record.Target.Handle) -ne $record.TargetId -or (HashHandle $record.Target.Handle) -ne $record.Op.previousHash)) { Fail ('destino alterado: ' + $record.Op.target) }
    $stageName = ([string]$owned.IndexOf($record)) + '.stage'
    $record.Stage = OpenNative $tx.Handle $stageName $false $true $true
    if ($record.Source -ne [IntPtr]::Zero) { CopyHandle $record.Source.Handle $record.Stage }
    else { WriteBytes ([Convert]::FromBase64String([string]$record.Op.contentBase64)) $record.Stage }
    if ((HashHandle $record.Stage) -ne $record.Op.sourceHash) { Fail ('staging divergente: ' + $record.Op.target) }
  }
  $directoryCreationLedger = [Collections.Generic.List[object]]::new()
  foreach ($record in $directories) {
    $probe = OpenChain $record.Op.target $true $true $false $false
    $probeId = if ($probe.Exists) { Identity $probe.Handle } else { $null }
    $probeParentId = if ($probe.Parent -ne [IntPtr]::Zero) { Identity $probe.Parent } else { $null }
    if ($null -ne $record.Op.expectedTarget -and ([bool]$record.Op.expectedTarget.exists -ne [bool]$probe.Exists -or ($probe.Exists -and [string]$record.Op.expectedTarget.id -ne $probeId))) { Fail ('diretório alterado: ' + $record.Op.target) }
    if ($null -ne $record.Op.expectedParent) {
      $parentMatches = ([string]$record.Op.expectedParent.id -eq $probeParentId) -and ([string]$record.Op.expectedParent.path).Equals([string]$probe.ParentPath,[StringComparison]::OrdinalIgnoreCase)
      if (-not $parentMatches) {
        $base = [IO.Path]::GetFullPath([string]$record.Op.expectedParent.path)
        $actual = [IO.Path]::GetFullPath([string]$probe.ParentPath)
        $ownedParent = $directoryCreationLedger | Where-Object { $_.Path.Equals($actual,[StringComparison]::OrdinalIgnoreCase) -and $actual.StartsWith($base + '\',[StringComparison]::OrdinalIgnoreCase) }
        if (-not $ownedParent) { Fail ('ancestral alterado: ' + $record.Op.target) }
      }
    }
    if (-not $probe.Exists) {
      $created = OpenChain $record.Op.target $true $false $true $true
      $record.Handle = $created.Handle
      $record.Created = $true
    } else {
      $record.Handle = $probe.Handle
    }
  }
  foreach ($record in $owned) {
    # Existing preimages remain pinned until same-handle quarantine.
    if ($record.Target.Exists) { continue }
    $resolved = OpenChain $record.Op.target $false $true $false $true
    $resolvedParentId = if ($resolved.Parent -ne [IntPtr]::Zero) { Identity $resolved.Parent } else { $null }
    if ($null -ne $record.Op.expectedParent) {
      $parentMatches = ([string]$record.Op.expectedParent.id -eq $resolvedParentId) -and ([string]$record.Op.expectedParent.path).Equals([string]$resolved.ParentPath,[StringComparison]::OrdinalIgnoreCase)
      if (-not $parentMatches) {
        $base = [IO.Path]::GetFullPath([string]$record.Op.expectedParent.path)
        $actual = [IO.Path]::GetFullPath([string]$resolved.ParentPath)
        $ownedParent = $directoryCreationLedger | Where-Object { $_.Path.Equals($actual,[StringComparison]::OrdinalIgnoreCase) -and $actual.StartsWith($base + '\',[StringComparison]::OrdinalIgnoreCase) }
        if (-not $ownedParent) { Fail ('ancestral alterado: ' + $record.Op.target) }
      }
    }
    if ($resolved.Exists) { Fail ('colisão no destino após criação dos ancestrais: ' + $record.Op.target) }
    if ($resolved.Deferred) { Fail ('ancestral gerenciado ausente: ' + $record.Op.target) }
    $record.Target = $resolved
    $record.TargetId = $null
  }
  foreach ($record in $owned) {
    if ($record.Target.Exists) {
      if ((Identity $record.Target.Handle) -ne $record.TargetId -or (HashHandle $record.Target.Handle) -ne $record.Op.previousHash) { Fail ('destino alterado: ' + $record.Op.target) }
      RenameHandle $record.Target.Handle $tx.Handle (([string]$owned.IndexOf($record)) + '.backup')
      $record.Previous = $record.Target
      if ($record.Op.retainBackup -ne $false) { $retainedBackup = $true }
    }
  }
  foreach ($record in $owned) {
    if (-not $record.Target.Exists -and (FindChild $record.Target.Parent $record.Target.Name)) { Fail ('colisão no destino: ' + $record.Op.target) }
    RenameHandle $record.Stage $record.Target.Parent $record.Target.Name
    $record.Published = $true
    if ((HashHandle $record.Stage) -ne $record.Op.sourceHash) { Fail ('destino divergente: ' + $record.Op.target) }
  }
  foreach ($record in $owned) {
    if ((HashHandle $record.Stage) -ne $record.Op.sourceHash) { Fail ('inventário final divergente: ' + $record.Op.target) }
  }
  foreach ($record in $equal) {
    if ($record.Source -ne [IntPtr]::Zero -and (Identity $record.Source.Handle) -ne $record.SourceId) { Fail ('arquivo equal alterado: ' + $record.Op.target) }
    if ((Identity $record.Target.Handle) -ne $record.TargetId -or (HashHandle $record.Target.Handle) -ne $record.Op.previousHash) { Fail ('arquivo equal alterado: ' + $record.Op.target) }
  }
  $committed = $true
  foreach ($record in $owned) {
    if ($record.Op.retainBackup -eq $false -and $record.Previous) {
      DeleteHandle $record.Previous.Handle
      CloseNative $record.Previous.Handle
    }
  }
  if (-not $retainedBackup) { DeleteHandle $tx.Handle }
  $response = [ordered]@{ schema = 'fs-transaction.windows.v1'; nonce = [string]$payload.nonce; ok = $true; operationCount = [int]$payload.operationCount; hostVersion = 'WindowsPowerShell/' + $PSVersionTable.PSVersion.ToString(); architecture = [IntPtr]::Size * 8; event = 'commit-complete' }
} catch {
  $failureMessage = $_.Exception.Message
  $partial = [Collections.Generic.List[string]]::new()
  if (-not $committed) {
    foreach ($record in ($owned | Sort-Object { $_.Op.target } -Descending)) {
      try {
        if ($record.Stage -ne [IntPtr]::Zero) {
          DeleteHandle $record.Stage
          CloseNative $record.Stage
        }
        if ($record.Previous) { RenameHandle $record.Previous.Handle $record.Target.Parent $record.Target.Name }
      } catch { [void]$partial.Add([string]$record.Op.target) }
    }
    foreach ($entry in ($directoryCreationLedger | Sort-Object { $_.Path.Length } -Descending)) {
      try {
        DeleteHandle $entry.Handle
        CloseNative $entry.Handle
      } catch { [void]$partial.Add([string]$entry.Path) }
    }
  }
  $rollback = if ($committed) { 'commit irreversível — publicações preservadas; limpeza incompleta' } elseif ($partial.Count) { 'parcial — conflitos preservados: ' + ($partial -join '; ') } else { 'concluído' }
  $response = [ordered]@{ schema = 'fs-transaction.windows.v1'; nonce = [string]$payload.nonce; ok = $false; operationCount = [int]$payload.operationCount; hostVersion = 'WindowsPowerShell/' + $PSVersionTable.PSVersion.ToString(); architecture = [IntPtr]::Size * 8; error = ($failureMessage + '; rollback ' + $rollback) }
} finally {
  foreach ($handle in @($allHandles)) {
    try { CloseNative $handle } catch { if ($null -eq $closeFailure) { $closeFailure = $_.Exception.Message } }
  }
}
if ($null -eq $response) { $response = [ordered]@{ schema = 'fs-transaction.windows.v1'; nonce = [string]$payload.nonce; ok = $false; operationCount = [int]$payload.operationCount; hostVersion = 'WindowsPowerShell/' + $PSVersionTable.PSVersion.ToString(); architecture = [IntPtr]::Size * 8; error = 'host terminou sem resposta' } }
if ($closeFailure) { $response['ok'] = $false; $response['error'] = ([string]$response['error'] + '; close: ' + $closeFailure) }
[Console]::Out.WriteLine(($response | ConvertTo-Json -Compress -Depth 8))
if (-not $response.ok) { exit 1 }
`;

function applyWindows(operations, home, sourceScopes = [], inspectOnly = false) {
  const { executable, root } = windowsPowerShellPath();
  const nonce = randomUUID();
  const payload = {
    nonce,
    operationCount: operations.length,
    home,
    sourceScopes,
    inspectOnly,
    operations: operations.map(operation => ({
      source: operation.source,
      target: operation.target,
      directory: Boolean(operation.directory),
      verify: Boolean(operation.verify),
      contentBase64: operation.content === undefined ? null : Buffer.from(operation.content).toString("base64"),
      retainBackup: operation.retainBackup !== false,
      expectedTarget: operation.expectedTarget ?? null,
      expectedParent: operation.expectedParent ?? null,
      sourceHash: operation.sourceState?.hash ?? null,
      previousHash: operation.previous?.hash ?? null,
    })),
  };
  const drive = root.slice(0, 2);
  const profileFile = executable;
  const env = {
    HOMEDRIVE: drive,
    HOMEPATH: profileFile.slice(2),
    LOGONSERVER: "",
    PATH: "",
    SYSTEMDRIVE: drive,
    SYSTEMROOT: root,
    TEMP: path.win32.join(root, "Temp"),
    USERDOMAIN: "",
    USERNAME: "",
    USERPROFILE: profileFile,
    WINDIR: root,
    APPDATA: profileFile,
    LOCALAPPDATA: profileFile,
    HOME: profileFile,
    TMP: path.win32.join(root, "Temp"),
    PATHEXT: "",
    PSModulePath: path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "Modules"),
  };
  const result = spawnSync(executable, ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-OutputFormat", "Text", "-Command", WINDOWS_TRANSACTION], {
    cwd: root,
    input: JSON.stringify(payload),
    encoding: "utf8",
    env,
    windowsHide: true,
  });
  if (result.error) throw failure(`Windows TCB falhou: ${result.error.message}`);
  const stdout = String(result.stdout ?? "").trim();
  const lines = stdout ? stdout.split(/\r?\n/).filter(line => line.length > 0) : [];
  if (lines.length !== 1) throw failure("Windows TCB sem handshake terminal único");
  let response;
  try { response = JSON.parse(lines[0]); } catch (error) { throw failure(`Windows TCB handshake inválido: ${error.message}`); }
  if (!response || typeof response !== "object" || Array.isArray(response)) throw failure("Windows TCB handshake não-objeto");
  const keys = Object.keys(response).sort();
  const allowed = ["architecture", "error", "event", "hostVersion", "inspection", "nonce", "ok", "operationCount", "schema"];
  const expectedKeys = inspectOnly ? "architecture,event,hostVersion,inspection,nonce,ok,operationCount,schema" : "architecture,event,hostVersion,nonce,ok,operationCount,schema";
  if (keys.some(key => !allowed.includes(key)) || (response.ok && keys.join(",") !== expectedKeys) || (!response.ok && !keys.includes("error")) || response.schema !== "fs-transaction.windows.v1" || response.nonce !== nonce || response.architecture !== 64 || !/^WindowsPowerShell\/5\.1(?:\.|$)/.test(response.hostVersion || "") || response.operationCount !== operations.length || (response.ok && response.event !== (inspectOnly ? "inspect-complete" : "commit-complete"))) {
    throw failure("Windows TCB handshake incompatível");
  }
  if (result.status !== 0 || response.ok !== true) throw failure(response.error || "transação Windows recusada");
  if (inspectOnly) {
    if (!Array.isArray(response.inspection) || response.inspection.length !== operations.length) {
      throw failure("Windows TCB inspeção incompleta");
    }
    const targets = new Set();
    for (const [index, entry] of response.inspection.entries()) {
      const directory = Boolean(operations[index].directory);
      if (
        !entry || typeof entry !== "object" || Array.isArray(entry) ||
        Object.keys(entry).sort().join(",") !== "exists,hash,id,parent,target" ||
        entry.target !== operations[index].target || targets.has(entry.target) ||
        typeof entry.exists !== "boolean" ||
        (entry.exists
          ? !/^[0-9a-f]{48}$/.test(entry.id) || (directory ? entry.hash !== null : !/^[0-9a-f]{64}$/.test(entry.hash))
          : entry.id !== null || entry.hash !== null) ||
        !entry.parent || typeof entry.parent !== "object" || Array.isArray(entry.parent) ||
        Object.keys(entry.parent).sort().join(",") !== "id,path" ||
        typeof entry.parent.path !== "string" || !path.win32.isAbsolute(entry.parent.path) ||
        !/^[0-9a-f]{48}$/.test(entry.parent.id)
      ) throw failure("Windows TCB identidade de inspeção incompatível");
      targets.add(entry.target);
    }
    return { ok: true, event: "inspect-complete", targets: response.inspection };
  }
  return { ok: true, response };
}

export function inspectTargets(targets, { home = os.homedir() } = {}) {
  if (!Array.isArray(targets)) throw new TypeError("targets must be an array");
  const entries = targets.map(target => typeof target === "string"
    ? { target, directory: false }
    : { target: target?.target, directory: Boolean(target?.directory) });
  if (process.platform === "win32") return applyWindows(entries, home, [], true);
  return inspectTargetsPosix(entries, home);
}

export function transact(operations, { home = os.homedir(), sourceScopes = [], inspectOnly = false } = {}) {
  if (!Array.isArray(operations)) throw new TypeError("operations must be an array");
  if (operations.length === 0) return { ok: true };
  if (process.platform === "win32") return applyWindows(operations, home, sourceScopes, inspectOnly);
  if (inspectOnly) return inspectTargetsPosix(operations, home);
  const captured = capture(operations, home, sourceScopes);
  const preflightResult = preflight(captured, home);
  if (preflightResult) throw failure(`destino não gravável ${preflightResult.target}: ${preflightResult.error?.message || preflightResult.error}`);
  return applyPosix(captured, home, sourceScopes);
}

export const windowsHostPath = windowsPowerShellPath;
