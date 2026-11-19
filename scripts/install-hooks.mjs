// Runtime suportado: Node.js >=20.
// Instala os git hooks do projeto (npm prepare roda automaticamente no npm install).
import fs from "node:fs";
import { lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import crypto from "node:crypto";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { inspectTargets, transact, windowsHostPath } from "../tdd-orchestrator/lib/fs-transaction/index.mjs";
import { createGitSession } from "./lib/git-trust-source.mjs";

const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
const HOOKS = ["commit-msg", "pre-push"];
const GENERATED_MARKER = "Gerado por scripts/install-hooks.mjs";
const MAX_GENERATED_BYTES = 8 * 1024 * 1024;
// Published v0.4.0 source payloads, pinned to revision 02582a867f660bf8aa387fe51f71b7fffd3a7dfd (proof: local://ship-released-hook-payloads-v040.json).
const KNOWN_RELEASED_HOOK_HASHES = Object.freeze({
  "commit-msg": "f00329a439c79349ef19eb0b321d6f28c744dfab4ce1973b9170da1657cfa407",
  "pre-push": "6cbbd6ffc2a25b3ed7c3e43da9b4c6572469fd64fbdcc0cbbe5a3396e59dd1dd",
});
const CONSENT_MARKERS = [".usefulskills-hooks", ".usefulskills-hooks.marker", ".git-hooks-managed"];

const gitSession = createGitSession({
  fs,
  path,
  crypto,
  os,
  spawnSync,
  platform: process.platform,
  env: process.env,
  windowsHostPath,
});

function git(args) {
  const result = gitSession.run(args, { cwd: root });
  if (result?.error) {
    if (result.error.code === "ENOENT") return { absent: true };
    return {
      failure: Object.assign(result.error, {
        status: result.status,
        stderr: String(result.stderr ?? ""),
      }),
    };
  }
  const stdout = String(result?.stdout ?? "");
  const stderr = String(result?.stderr ?? "");
  if (result?.status === 0) return { stdout, stderr };
  if (
    result?.status === 128 &&
    /not a git repository|outside a git work tree|no es un repositorio git|não é um repositório git|nao e um repositorio git|pas un dépôt git|pas un depot git|kein git[- ]repository|non è un repository git|non e un repository git|geen git-opslagplaats|--local can only be used inside a git repository/i.test(stderr)
  ) {
    return { absent: true };
  }
  return {
    failure: Object.assign(new Error(stderr.trim() || `git exited with ${result?.status}`), {
      status: result?.status,
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
    if (sourceResult.stat.size > MAX_GENERATED_BYTES) throw new Error(`origem do hook excede o limite de ${MAX_GENERATED_BYTES} bytes: ${source}`);
    const sourceText = readFileSync(source, "utf8");
    const sourceBytes = Buffer.byteLength(sourceText);
    const sourceAfter = lstatSafe(source);
    if (
      sourceAfter.error ||
      !regularUnlinked(sourceAfter.stat) ||
      sourceAfter.stat.dev !== sourceResult.stat.dev ||
      sourceAfter.stat.ino !== sourceResult.stat.ino ||
      sourceAfter.stat.size !== sourceResult.stat.size ||
      sourceAfter.stat.mtimeMs !== sourceResult.stat.mtimeMs
    ) {
      throw new Error(`origem do hook alterada durante leitura: ${source}`);
    }
    if (sourceBytes > MAX_GENERATED_BYTES) throw new Error(`origem do hook excede o limite de ${MAX_GENERATED_BYTES} bytes: ${source}`);
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

function isManaged(destination, expected, sourceText, wrapper, inspectedHash, name) {
  try {
    const current = readFileSync(destination);
    const currentHash = createHash("sha256").update(current).digest("hex");
    if (!inspectedHash || currentHash !== inspectedHash) return false;
    if (current.equals(expected)) return true;
    const releasedHash = KNOWN_RELEASED_HOOK_HASHES[name];
    if (!releasedHash) return false;
    const sidecarPrefix = `// ${GENERATED_MARKER} — edite o original em scripts/hooks/${name}.mjs.\n`;
    const payload = current.toString("utf8");
    if (wrapper) {
      const wrapperPrefix = [
        "#!/bin/sh",
        `# ${GENERATED_MARKER} — edite o original em scripts/hooks/${name}.mjs.`,
        `exec node "$0.mjs" "$@"`,
        "",
        sidecarPrefix,
      ].join("\n");
      return payload.startsWith(wrapperPrefix) && createHash("sha256").update(payload.slice(wrapperPrefix.length), "utf8").digest("hex") === releasedHash;
    }
    return payload.startsWith(sidecarPrefix) && createHash("sha256").update(payload.slice(sidecarPrefix.length), "utf8").digest("hex") === releasedHash;
  } catch {
    return false;
  }
}


function commitStaged(hooksDir, files, transactionHome) {
  const operations = files.map(item => {
    const target = path.join(hooksDir, item.file);
    const current = lstatSafe(target).stat;
    const bytesEqual = current?.isFile() && readFileSync(target).equals(item.content);
    return {
      target,
      content: item.content,
      mode: item.wrapper ? (bytesEqual ? (current.mode & 0o7777) | 0o500 : 0o755) : undefined,
      retainBackup: false,
      expectedTarget: item.expectedTarget,
      expectedParent: item.expectedParent,
    };
  });
  return transact(operations, {
    home: transactionHome,
    sourceScopes: [canonicalPath(root)],
  });
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
    } else if (!isManaged(item.destination, item.content, item.sourceText, item.wrapper, item.expectedTarget?.hash, item.name)) {
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
  const commonDirResult = git(["rev-parse", "--git-common-dir"]);
  if (commonDirResult.absent) throw new Error("falha operacional: Git não informou o diretório comum do repositório.");
  if (commonDirResult.failure) throw new Error(`falha operacional ao consultar Git: ${commonDirResult.failure.message}`);
  const rawCommonDir = commonDirResult.stdout.trim();
  if (!rawCommonDir) throw new Error("Git não informou um diretório comum do repositório.");

  // Em linked worktrees, o destino padrão fica no hooksDir comum do repositório
  // principal, não em <worktree>/.git/hooks.
  const canonicalCommonHooksDir = canonicalPath(path.join(path.resolve(root, rawCommonDir), "hooks"));


  // Canonicalizar o diretório efetivo antes de qualquer preflight ou escrita.
  // Isso expande aliases 8.3 no Windows e também impede que um caminho textual
  // alcance as fontes canônicas por meio de um ancestral alternativo.
  const canonicalRoot = canonicalPath(root);
  // Node's lexical normalization collapses symlink/.. before the filesystem
  // can apply its effective meaning. Refuse that ambiguous traversal.
  const rawParts = rawHooksDir.split(/[\\/]/);
  let cursor = path.isAbsolute(rawHooksDir) ? path.parse(rawHooksDir).root : root;
  let symlinkSeen = false;
  let missingSeen = false;
  for (const component of rawParts) {
    if (!component || component === "." || component === path.parse(rawHooksDir).root.replace(/[\\/]/g, "")) continue;
    if (component === ".." && (symlinkSeen || missingSeen)) throw new Error("core.hooksPath contém travessia '..' ambígua após symlink/junction ou componente ausente; configure o destino efetivo sem travessia.");
    cursor = path.join(cursor, component);
    const entry = lstatSafe(cursor);
    if (entry.error) throw entry.error;
    if (entry.stat?.isSymbolicLink()) symlinkSeen = true;
    if (!entry.stat) missingSeen = true;
  }
  const hooksDir = path.resolve(root, rawHooksDir);
  const canonicalHooksDir = canonicalPath(hooksDir);
  const hooksInside = inside(canonicalRoot, canonicalHooksDir);
  const consent = hasConsent(canonicalHooksDir);
  const defaultHooks = samePath(canonicalHooksDir, canonicalCommonHooksDir);
  const issues = [
    ...new Set([...validateAncestors(hooksDir), ...validateAncestors(canonicalHooksDir)]),
  ];
  if (samePath(canonicalHooksDir, canonicalRoot) && !consent) {
    issues.push("core.hooksPath aponta para a raiz do projeto");
  }
  if (!hooksInside && !consent && !defaultHooks) issues.push(`core.hooksPath externo ao projeto: ${canonicalHooksDir}`);
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
  const transactionHome = hooksInside ? canonicalRoot : path.dirname(canonicalHooksDir);
  const inspection = inspectTargets(destinations.map(item => item.destination), { home: transactionHome });
  const inspectedByTarget = new Map(inspection.targets.map(item => [path.resolve(item.target), item]));
  for (const item of destinations) {
    const snapshot = inspectedByTarget.get(path.resolve(item.destination));
    if (!snapshot) throw new Error(`inspeção nativa ausente para ${item.destination}`);
    item.expectedTarget = { exists: snapshot.exists, hash: snapshot.hash, id: snapshot.id };
    item.expectedParent = snapshot.parent;
  }
  issues.push(...validateHookDestinations(destinations));
  if (issues.length > 0) throw new Error(issues.join("; "));
  commitStaged(canonicalHooksDir, destinations, transactionHome);
}

try {
  main();
} catch (error) {
  console.error(`[install-hooks] ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  try {
    gitSession.close();
  } catch (error) {
    if (process.exitCode === undefined) {
      console.error(`[install-hooks] falha ao fechar sessão Git: ${error?.message || error}`);
      process.exitCode = 1;
    }
  }
}
