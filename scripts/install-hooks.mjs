// Runtime suportado: Node.js >=20.
// Instala os git hooks do projeto (npm prepare roda automaticamente no npm install).
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const HOOKS = ["commit-msg", "pre-push"];
const GENERATED_MARKER = "Gerado por scripts/install-hooks.mjs";
const CONSENT_MARKERS = [".usefulskills-hooks", ".usefulskills-hooks.marker", ".git-hooks-managed"];

function gitExecutable() {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const candidates = process.platform === "win32" ? ["git.exe", "git.cmd", "git.bat", "git"] : ["git"];
  for (const directory of (process.env[pathKey] ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const candidate of candidates) {
      const executable = path.join(directory, candidate);
      const result = lstatSafe(executable);
      if (regularUnlinked(result.stat)) return executable;
    }
  }
  return null;
}

function git(args) {
  const executable = gitExecutable();
  if (!executable) {
    return { failure: new Error("E_UNSAFE_GIT_EXECUTABLE: nenhum executável Git regular e não vinculado foi encontrado no PATH") };
  }
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    if (result.error.code === "ENOENT") return { absent: true };
    return { failure: result.error };
  }
  const stderr = result.stderr || "";
  if (result.status === 0) return { stdout: result.stdout || "", stderr };
  if (
    result.status === 128 &&
    /not a git repository|outside a git work tree|no es un repositorio git|não é um repositório git|nao e um repositorio git|pas un dépôt git|pas un depot git|kein git[- ]repository|non è un repository git|non e un repository git|geen git-opslagplaats|--local can only be used inside a git repository/i.test(stderr)
  ) {
    return { absent: true };
  }
  return {
    failure: Object.assign(new Error(stderr.trim() || `git exited with ${result.status}`), {
      status: result.status,
      stderr,
    }),
  };
}

function configuredHooksPath() {
  const result = git(["config", "--local", "--null", "--get-all", "core.hooksPath"]);
  if (result.absent) return result;
  if (result.failure) {
    // `git config --get-all` exits 1 when the key is simply absent.
    if (result.failure.status === 1) return { empty: false };
    return result;
  }
  const values = result.stdout.endsWith("\0")
    ? result.stdout.slice(0, -1).split("\0")
    : result.stdout.split("\0");
  return { empty: values.at(-1) === "" };
}

function lstatSafe(file) {
  try {
    return { stat: lstatSync(file), error: null };
  } catch (error) {
    if (error?.code === "ENOENT") return { stat: null, error: null };
    return { stat: null, error };
  }
}

function typeOf(stat) {
  if (!stat) return "ausente";
  if (stat.isSymbolicLink()) return "symlink/junction";
  if (stat.isDirectory()) return "diretório";
  if (stat.isFile() && stat.nlink > 1) return "hardlink";
  if (stat.isFile()) return "arquivo regular";
  if (stat.isFIFO?.()) return "FIFO";
  if (stat.isSocket?.()) return "socket";
  if (stat.isCharacterDevice?.()) return "device";
  if (stat.isBlockDevice?.()) return "device";
  return "especial";
}

function regularUnlinked(stat) {
  return Boolean(stat?.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
}

function inside(rootPath, target) {
  const relative = path.relative(rootPath, target);
  const parentSegment = `..${path.sep}`;
  return relative !== "" && relative !== ".." && !relative.startsWith(parentSegment) && !path.isAbsolute(relative);
}

function samePath(left, right) {
  const normalizedLeft = canonicalPath(left);
  const normalizedRight = canonicalPath(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function canonicalPath(file) {
  const normalized = path.normalize(path.resolve(file));
  let current = normalized;
  const suffix = [];
  while (true) {
    const result = lstatSafe(current);
    if (result.error) {
      if (result.error.code !== "ENOENT" && result.error.code !== "ENOTDIR") throw result.error;
    } else if (result.stat) {
      const canonicalExisting = path.normalize(realpathSync.native(current));
      return path.normalize(path.join(canonicalExisting, ...suffix.reverse()));
    }

    const parent = path.dirname(current);
    if (parent === current) throw new Error(`não foi possível canonicalizar o caminho ${normalized}`);
    suffix.push(path.basename(current));
    current = parent;
  }
}

function hasConsent(target) {
  if (process.argv.includes("--allow-external-hooks") || /^(1|true|yes)$/i.test(process.env.USEFULSKILLS_ALLOW_EXTERNAL_HOOKS || "")) {
    return true;
  }
  for (const marker of CONSENT_MARKERS) {
    const result = lstatSafe(path.join(target, marker));
    if (regularUnlinked(result.stat)) return true;
  }
  return false;
}

function validateAncestors(target) {
  const issues = [];
  let current = target;
  while (true) {
    const result = lstatSafe(current);
    if (result.error) {
      issues.push(`ancestral inacessível ${current}: ${result.error.message}`);
    } else if (result.stat && result.stat.isSymbolicLink()) {
      issues.push(`ancestral contém symlink/junction ${current}`);
    } else if (result.stat && !result.stat.isDirectory()) {
      issues.push(`ancestral inválido ${current}: ${typeOf(result.stat)}`);
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return issues;
}

function sharedDirectoryIssues(hooksDir, isDefault, consent) {
  if (consent || isDefault) return [];
  const result = lstatSafe(hooksDir);
  if (!result.stat?.isDirectory()) return [];
  let names;
  try {
    names = readdirSync(hooksDir);
  } catch (error) {
    return [`não foi possível ler hooksDir ${hooksDir}: ${error.message}`];
  }
  const managed = new Set(HOOKS.flatMap((name) => [name, `${name}.mjs`]));
  const unrelated = names.filter((name) => !managed.has(name) && !name.endsWith(".sample") && !CONSENT_MARKERS.includes(name));
  return unrelated.length > 0
    ? [`core.hooksPath compartilhado; conteúdo de outro consumidor: ${unrelated.join(", ")}`]
    : [];
}

function generatedFiles() {
  return HOOKS.map((name) => {
    const source = path.join(root, "scripts", "hooks", `${name}.mjs`);
    const sourceResult = lstatSafe(source);
    if (sourceResult.error) throw new Error(`não foi possível ler a origem do hook ${source}: ${sourceResult.error.message}`);
    if (!regularUnlinked(sourceResult.stat)) {
      throw new Error(`origem insegura do hook ${source}: ${typeOf(sourceResult.stat)}`);
    }
    const sourceText = readFileSync(source, "utf8");
    const sidecarText = `// ${GENERATED_MARKER} — edite o original em scripts/hooks/${name}.mjs.\n${sourceText}`;
    const wrapperText = [
      "#!/bin/sh",
      `# ${GENERATED_MARKER} — edite o original em scripts/hooks/${name}.mjs.`,
      `exec node "$0.mjs" "$@"`,
      "",
      sidecarText,
    ].join("\n");
    return {
      name,
      sourceText,
      files: [
        { file: name, content: Buffer.from(wrapperText), wrapper: true },
        { file: `${name}.mjs`, content: Buffer.from(sidecarText), wrapper: false },
      ],
    };
  });
}

function isManaged(destination, expected, sourceText, wrapper) {
  try {
    const current = readFileSync(destination);
    if (current.equals(expected)) return true;
    if (current.length >= expected.length && current.subarray(0, expected.length).equals(expected)) return true;
    if (!wrapper && current.equals(Buffer.from(sourceText))) return true;
    return false;
  } catch {
    return false;
  }
}

function replacePath(source, destination) {
  if (process.platform !== "win32") {
    renameSync(source, destination);
    return;
  }
  const current = lstatSafe(destination).stat;
  const previous = current?.isFile() ? readFileSync(destination) : null;
  const previousMode = current?.isFile() ? current.mode & 0o7777 : null;
  rmSync(destination, { force: true });
  try {
    renameSync(source, destination);
  } catch (error) {
    if (existsSync(destination)) throw error;
    if (previous) {
      writeFileSync(destination, previous);
      if (previousMode !== null) chmodSync(destination, previousMode);
    }
    throw error;
  }
}

function rollbackCommitted(committed, backups) {
  const failures = [];
  for (const destination of [...committed].reverse()) {
    const backupPath = backups.get(destination);
    try {
      if (backupPath) {
        replacePath(backupPath, destination);
      } else {
        rmSync(destination, { force: true });
      }
    } catch (error) {
      failures.push({ destination, error });
    }
  }
  return failures;
}

function stageHookFiles(hooksDir, transaction, files) {
  const { stage, backup, backups } = transaction;
  for (const item of files) {
    const staged = path.join(stage, item.file);
    writeFileSync(staged, item.content);
    if (item.wrapper) chmodSync(staged, 0o755);
    const destination = path.join(hooksDir, item.file);
    const current = lstatSafe(destination).stat;
    if (current) {
      const backupPath = path.join(backup, item.file);
      copyFileSync(destination, backupPath);
      chmodSync(backupPath, current.mode & 0o7777);
      backups.set(destination, backupPath);
    }
  }
}

function commitHookFiles(hooksDir, transaction, files) {
  const { stage, committed } = transaction;
  for (const item of files) {
    const staged = path.join(stage, item.file);
    const destination = path.join(hooksDir, item.file);
    const current = lstatSafe(destination).stat;
    const bytesEqual = current && readFileSync(destination).equals(item.content);
    const ownerReadableExecutable = current && (current.mode & 0o500) === 0o500;
    if (bytesEqual && (!item.wrapper || ownerReadableExecutable)) continue;

    committed.push(destination);
    if (!bytesEqual) replacePath(staged, destination);
    if (item.wrapper) {
      const mode = bytesEqual ? (current.mode & 0o7777) | 0o500 : 0o755;
      chmodSync(destination, mode);
    }
  }
}


function createHookTransaction(hooksDir) {
  const transactionRoot = path.dirname(hooksDir);
  let stage;
  try {
    stage = mkdtempSync(path.join(transactionRoot, ".usefulskills-hooks-stage-"));
    const backup = mkdtempSync(path.join(transactionRoot, ".usefulskills-hooks-backup-"));
    return {
      stage,
      backup,
      committed: [],
      backups: new Map(),
    };
  } catch (error) {
    if (stage) {
      try {
        rmSync(stage, { recursive: true, force: true });
      } catch (cleanupError) {
        error.message = `${error.message}; limpeza do stage falhou: ${cleanupError.message}`;
      }
    }
    throw error;
  }
}

function cleanupHookTransaction(transaction) {
  rmSync(transaction.stage, { recursive: true, force: true });
  rmSync(transaction.backup, { recursive: true, force: true });
}

function commitStaged(hooksDir, files) {
  const transaction = createHookTransaction(hooksDir);
  try {
    stageHookFiles(hooksDir, transaction, files);
    commitHookFiles(hooksDir, transaction, files);
  } catch (error) {
    const rollbackFailures = rollbackCommitted(transaction.committed, transaction.backups);
    if (rollbackFailures.length > 0) {
      const details = rollbackFailures
        .map(({ destination, error: rollbackError }) => `${destination}: ${rollbackError.message}`)
        .join("; ");
      throw new Error(
        `falha ao instalar hooks: ${error?.message || error}; rollback incompleto e estado inseguro — ${details}`,
        { cause: error },
      );
    }
    throw error;
  } finally {
    cleanupHookTransaction(transaction);
  }
}

function validateHookDestinations(destinations) {
  const issues = [];
  for (const item of destinations) {
    const result = lstatSafe(item.destination);
    if (result.error) {
      issues.push(`destino inacessível ${item.destination}: ${result.error.message}`);
      continue;
    }
    if (!result.stat) continue;
    if (!regularUnlinked(result.stat)) {
      issues.push(`destino ${item.destination}: ${typeOf(result.stat)} — preservado`);
    } else if (!isManaged(item.destination, item.content, item.sourceText, item.wrapper)) {
      issues.push(`conflito no hook existente ${item.destination}: arquivo regular do consumidor — preservado`);
    }
  }
  return issues;
}

function main() {
  const configured = configuredHooksPath();
  if (configured.absent) {
    console.log("Sem git neste diretório — hooks não instalados.");
    return;
  }
  if (configured.failure) {
    throw new Error(`falha operacional ao consultar Git ao ler core.hooksPath: ${configured.failure.message}`);
  }
  if (configured.empty) throw new Error("core.hooksPath vazio; destino de hooks não será inferido na raiz.");

  const revParse = git(["rev-parse", "--git-path", "hooks"]);
  if (revParse.absent) {
    console.log("Sem git neste diretório — hooks não instalados.");
    return;
  }
  if (revParse.failure) throw new Error(`falha operacional ao consultar Git: ${revParse.failure.message}`);

  const rawHooksDir = revParse.stdout.trim();
  if (!rawHooksDir) throw new Error("core.hooksPath vazio; Git não informou um destino de hooks.");

  // Canonicalizar o diretório efetivo antes de qualquer preflight ou escrita.
  // Isso expande aliases 8.3 no Windows e também impede que um caminho textual
  // alcance as fontes canônicas por meio de um ancestral alternativo.
  const canonicalRoot = canonicalPath(root);
  const hooksDir = path.resolve(root, rawHooksDir);
  const canonicalHooksDir = canonicalPath(hooksDir);
  const hooksInside = inside(canonicalRoot, canonicalHooksDir);
  const consent = hasConsent(canonicalHooksDir);
  const defaultHooks = samePath(canonicalHooksDir, path.join(root, ".git", "hooks"));
  const issues = [
    ...new Set([...validateAncestors(hooksDir), ...validateAncestors(canonicalHooksDir)]),
  ];
  if (samePath(canonicalHooksDir, canonicalRoot) && !consent) {
    issues.push("core.hooksPath aponta para a raiz do projeto");
  }
  if (!hooksInside && !consent) issues.push(`core.hooksPath externo ao projeto: ${canonicalHooksDir}`);
  issues.push(...sharedDirectoryIssues(canonicalHooksDir, defaultHooks, consent));

  const canonicalSourceHooksDir = path.join(canonicalRoot, "scripts", "hooks");
  if (samePath(canonicalHooksDir, canonicalSourceHooksDir)) {
    issues.push("core.hooksPath aponta para as fontes canônicas em scripts/hooks");
  }
  if (issues.length > 0) throw new Error(issues.join("; "));

  const expected = generatedFiles();
  const destinations = expected.flatMap((entry) => entry.files.map((item) => ({
    ...item,
    destination: path.join(canonicalHooksDir, item.file),
    name: entry.name,
    sourceText: entry.sourceText,
  })));
  issues.push(...validateHookDestinations(destinations));
  if (issues.length > 0) throw new Error(issues.join("; "));

  const hooksResult = lstatSafe(canonicalHooksDir);
  if (hooksResult.stat && !hooksResult.stat.isDirectory()) throw new Error(`hooksDir inválido: ${canonicalHooksDir}`);
  if (!hooksResult.stat) mkdirSync(canonicalHooksDir, { recursive: true });
  commitStaged(canonicalHooksDir, destinations);
}

try {
  main();
} catch (error) {
  console.error(`[install-hooks] ${error?.message || error}`);
  process.exitCode = 1;
}
