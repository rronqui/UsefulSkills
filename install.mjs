#!/usr/bin/env node
// install.mjs — instala (ou confere) as skills e agentes do UsefulSkills.
// Uso:
//   node install.mjs           instala em ~/.omp/agent/ (skills/ e agents/)
//   node install.mjs --check   compara hashes; lista divergências; exit 1 se houver
// Requer: Node >= 20. Não toca nenhum arquivo fora do inventário abaixo.
import { createHash } from "node:crypto";
import {
  accessSync,
  constants as fsConstants,
  cpSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isInteger(nodeMajor) || nodeMajor < 20) {
  console.error(`E_UNSUPPORTED_NODE: Node >= 20 é necessário (runtime ${process.versions.node}).`);
  process.exit(1); // E_UNSUPPORTED_NODE: Node >= 20
}

const root = path.dirname(fileURLToPath(import.meta.url));
const home = os.homedir();
const agentRoot = path.join(home, ".omp", "agent");
const skillsDest = path.join(agentRoot, "skills");
const agentsDest = path.join(agentRoot, "agents");
const noticeSource = path.join(root, "NOTICE");
const noticeDest = path.join(agentRoot, "NOTICE");
const check = process.argv.includes("--check");

const SKILLS = [
  "alignment",
  "bug-diagnosis",
  "conflict-resolution",
  "deep-review",
  "release-bootstrap",
  "ship",
  "tdd-orchestrator",
];
// Agentes: [skill de origem, subdir dentro dela, basename do arquivo]
const AGENTS = [
  ["tdd-orchestrator", "agents", "backend-developer.md"],
  ["tdd-orchestrator", "agents", "frontend-developer.md"],
  ["tdd-orchestrator", "agents", "integrator.md"],
  ["tdd-orchestrator", "agents", "peer-reviewer.md"],
  ["tdd-orchestrator", "agents", "refactorer.md"],
  ["tdd-orchestrator", "agents", "spec-kit-author.md"],
  ["tdd-orchestrator", "agents", "test-author.md"],
  ["tdd-orchestrator", "agents", "validator.md"],
  ["deep-review", "agents", "deep-reviewer.md"],
];
const inventoryKey = (name) => process.platform === "win32" ? name.toLowerCase() : name;
const compareNames = (a, b) => {
  const ak = inventoryKey(a);
  const bk = inventoryKey(b);
  return ak < bk ? -1 : ak > bk ? 1 : 0;
};

function safeLstat(file) {
  try {
    return { stat: lstatSync(file), error: null };
  } catch (error) {
    if (error?.code === "ENOENT") return { stat: null, error: null };
    return { stat: null, error };
  }
}
function safeReaddir(dir) {
  try {
    return { names: readdirSync(dir).sort(compareNames), error: null };
  } catch (error) {
    return { names: [], error };
  }
}

function statType(stat) {
  if (!stat) return "missing";
  if (stat.isSymbolicLink()) return "symlink";
  if (stat.isDirectory()) return "directory";
  if (stat.isFile() && stat.nlink > 1) return "hardlink";
  if (stat.isFile()) return "file";
  if (typeof stat.isFIFO === "function" && stat.isFIFO()) return "special (FIFO)";
  if (typeof stat.isSocket === "function" && stat.isSocket()) return "special (socket)";
  if (typeof stat.isCharacterDevice === "function" && stat.isCharacterDevice()) return "special (character device)";
  if (typeof stat.isBlockDevice === "function" && stat.isBlockDevice()) return "special (block device)";
  return "special";
}

function isRegularFile(stat) {
  return Boolean(stat && stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
}

function inspectTree(dir) {
  const nodes = [];
  const issues = [];
  const pending = [""];
  while (pending.length > 0) {
    const relative = pending.pop();
    const current = path.join(dir, relative);
    const { names, error } = safeReaddir(current);
    if (error) {
      issues.push(`não foi possível ler ${current}: ${error?.code || error?.message || "erro"}`);
      continue;
    }
    for (let index = names.length - 1; index >= 0; index -= 1) {
      const name = names[index];
      const childRelative = relative ? path.join(relative, name) : name;
      const child = path.join(dir, childRelative);
      const { stat, error } = safeLstat(child);
      if (error) {
        issues.push(`não foi possível inspecionar ${child}: ${error?.code || error?.message || "erro"}`);
        continue;
      }
      if (!stat) {
        issues.push(`FALTA na origem: ${child}`);
        continue;
      }
      const type = statType(stat);
      nodes.push({ relative: childRelative, path: child, stat, type });
      if (type === "directory") pending.push(childRelative);
    }
  }
  nodes.sort((a, b) => compareNames(a.relative, b.relative));
  return { nodes, issues };
}

function destinationConflict(target) {
  const resolvedTarget = path.resolve(target);
  const resolvedHome = path.resolve(home);
  const relativeToHome = path.relative(resolvedHome, resolvedTarget);
  // Only user-controlled components below HOME are install conflicts. System
  // ancestors (for example macOS /var -> /private/var) are trusted.
  const startsOutsideHome = relativeToHome === ".." || relativeToHome.startsWith(`..${path.sep}`) || path.isAbsolute(relativeToHome);
  const rootPath = startsOutsideHome ? path.parse(resolvedTarget).root : resolvedHome;
  let current = rootPath;
  const relative = path.relative(rootPath, resolvedTarget);
  for (const segment of relative ? relative.split(path.sep) : []) {
    current = path.join(current, segment);
    const { stat, error } = safeLstat(current);
    if (error) return { kind: "inacessível", path: current };
    if (!stat) continue;
    if (stat.isSymbolicLink()) return { kind: "symlink/junction", path: current };
    if (!stat.isDirectory()) return { kind: statType(stat), path: current };
  }
  return null;
}

function sourceInventory(skill) {
  const src = path.join(root, skill);
  const rootResult = safeLstat(src);
  if (rootResult.error) return { files: [], dirs: [], issues: [`FALTA na origem ${src}: ${rootResult.error.message}`] };
  if (!rootResult.stat) return { files: [], dirs: [], issues: [`FALTA na origem ${src}`] };
  if (!rootResult.stat.isDirectory() || rootResult.stat.isSymbolicLink()) {
    return { files: [], dirs: [], issues: [`origem ${src} tem tipo inválido: ${statType(rootResult.stat)}`] };
  }

  const inspected = inspectTree(src);
  const issues = [...inspected.issues];
  const files = [];
  const dirs = [];
  for (const node of inspected.nodes) {
    if (node.type === "file") files.push(node);
    else if (node.type === "directory") dirs.push(node);
    else issues.push(`origem contém ${node.type}: ${node.path}`);
  }
  const expectedSkillFile = path.join("SKILL.md");
  if (!files.some((node) => inventoryKey(node.relative) === inventoryKey(expectedSkillFile))) {
    issues.push(`FALTA na origem: ${path.join(src, expectedSkillFile)}`);
  }
  return { files, dirs, issues };
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}
function safeSha256(file) {
  try {
    return { hash: sha256(file), error: null };
  } catch (error) {
    return { hash: null, error };
  }
}
function destinationInventory(dir) {
  const result = safeLstat(dir);
  if (result.error || !result.stat || !result.stat.isDirectory() || result.stat.isSymbolicLink()) {
    return { nodes: [], issues: [] };
  }
  const inspected = inspectTree(dir);
  return { nodes: inspected.nodes, issues: inspected.issues };
}

function hasDestinationAncestorConflict(relative, target, conflicts) {
  const conflict = destinationConflict(path.dirname(target));
  if (!conflict) return false;
  conflicts.push(`${relative}: ${conflict.kind} no ancestral ${conflict.path}`);
  return true;
}

function planSyncDir(dest, source) {
  const issues = [];
  const operations = [];
  const ancestor = destinationConflict(path.dirname(dest));
  if (ancestor) issues.push(`${ancestor.kind} no ancestral ${ancestor.path} — remova manualmente`);
  const destResult = safeLstat(dest);
  const destStat = destResult.stat;
  if (destResult.error) issues.push(`destino inacessível ${dest}: ${destResult.error.message}`);
  if (destStat && (!destStat.isDirectory() || destStat.isSymbolicLink())) {
    issues.push(`conflito de tipo na raiz ${dest}: ${statType(destStat)} onde deveria haver diretório`);
  }

  const destination = destStat?.isDirectory() ? destinationInventory(dest) : { nodes: [], issues: [] };
  issues.push(...destination.issues);
  const sourceKeys = new Set(source.files.map((node) => inventoryKey(node.relative)));
  const sourceDirs = new Set(source.dirs.map((node) => inventoryKey(node.relative)));
  let created = 0;
  let createdDirs = 0;
  let updated = 0;
  let equal = 0;
  let equalDirs = 0;
  const conflicts = [];

  for (const node of source.dirs) {
    const target = path.join(dest, node.relative);
    if (hasDestinationAncestorConflict(node.relative, target, conflicts)) continue;
    const result = safeLstat(target);
    if (result.error) {
      conflicts.push(`${node.relative}: destino inacessível (${result.error.code || result.error.message})`);
    } else if (!result.stat) {
      operations.push({ directory: true, target });
      createdDirs += 1;
    } else if (!result.stat.isDirectory() || result.stat.isSymbolicLink()) {
      conflicts.push(`${node.relative}: ${statType(result.stat)} no destino onde deveria haver diretório`);
    } else {
      equalDirs += 1;
    }
  }

  for (const node of source.files) {
    const target = path.join(dest, node.relative);
    if (hasDestinationAncestorConflict(node.relative, target, conflicts)) continue;
    const result = safeLstat(target);
    if (result.error) {
      conflicts.push(`${node.relative}: destino inacessível (${result.error.code || result.error.message})`);
      continue;
    }
    if (!result.stat) {
      operations.push({ source: node.path, target });
      created += 1;
    } else if (!isRegularFile(result.stat)) {
      conflicts.push(`${node.relative}: ${statType(result.stat)} no destino onde deveria haver arquivo`);
    } else if (sha256(node.path) !== sha256(target)) {
      operations.push({ source: node.path, target });
      updated += 1;
    } else {
      equal += 1;
    }
  }

  const extras = [];
  for (const node of destination.nodes) {
    const key = inventoryKey(node.relative);
    if (sourceKeys.has(key) || sourceDirs.has(key)) {
      if (node.type.startsWith("special") || node.type === "symlink") {
        conflicts.push(`${node.relative}: ${node.type} no destino`);
      }
      continue;
    }
    extras.push(`${node.relative} (${node.type})`);
  }
  if (issues.length > 0 || conflicts.length > 0) {
    return {
      status: "drift",
      detail: `${issues.concat(conflicts).join("; ") || "conflito de inventário"} — E_INSTALL_DRIFT`,
      operations,
      unsafe: true,
    };
  }
  if (check && extras.length > 0) {
    return {
      status: "drift",
      detail: `${equal} iguais, ${equalDirs} diretório(s) iguais, ${updated} divergem, ${created} faltam, ${createdDirs} diretório(s) faltam, extras locais: ${extras.join(", ")}`,
      operations,
      unsafe: false,
    };
  }
  if (updated > 0) return { status: check ? "drift" : "updated", detail: `${updated} arquivo(s) divergentes${check ? " (não alterados no --check)" : " atualizados"}`, operations, unsafe: false };
  if (created > 0 || createdDirs > 0) {
    const details = [];
    if (created > 0) details.push(`${created} arquivo(s) ${check ? "ausentes" : "instalados"}`);
    if (createdDirs > 0) details.push(`${createdDirs} diretório(s) ${check ? "ausentes" : "criados"}`);
    return { status: check ? "drift" : "created", detail: details.join(", "), operations, unsafe: false };
  }
  return { status: "equal", detail: `${equal} arquivo(s) iguais, ${equalDirs} diretório(s) iguais`, operations, unsafe: false };
}

function findProjectAgent(file) {
  let current = path.resolve(process.cwd());
  while (true) {
    const candidate = path.join(current, ".omp", "agents", file);
    const result = safeLstat(candidate);
    if (result.error) return { path: candidate, type: "inacessível" };
    if (result.stat) return { path: candidate, type: statType(result.stat) };
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function applyOperations(operations) {
  for (const operation of operations) {
    if (operation.directory) {
      mkdirSync(operation.target, { recursive: true });
      continue;
    }
    mkdirSync(path.dirname(operation.target), { recursive: true });
    cpSync(operation.source, operation.target);
  }
}
function nearestExistingPath(target) {
  let current = path.resolve(target);
  while (true) {
    const result = safeLstat(current);
    if (result.stat || result.error) return { path: current, ...result };
    const parent = path.dirname(current);
    if (parent === current) return { path: current, stat: null, error: new Error("no existing ancestor") };
    current = parent;
  }
}
function preflightOperations(operations) {
  const checked = new Set();
  for (const operation of operations) {
    const destination = path.resolve(operation.target);
    if (!operation.directory) {
      const sourceResult = safeLstat(operation.source);
      if (sourceResult.error) return { target: operation.source, error: sourceResult.error };
      if (!sourceResult.stat || !isRegularFile(sourceResult.stat)) {
        return { target: operation.source, error: new Error("source must be a regular file") };
      }
      try {
        accessSync(operation.source, fsConstants.R_OK);
      } catch (error) {
        return { target: operation.source, error };
      }
    }
    const targetResult = safeLstat(destination);
    if (targetResult.error) return { target: destination, error: targetResult.error };
    if (operation.directory && targetResult.stat?.isDirectory()) continue;
    const paths = [];
    if (targetResult.stat && !operation.directory) paths.push(destination);
    const parent = nearestExistingPath(path.dirname(destination));
    if (parent.error || !parent.stat?.isDirectory()) {
      return { target: destination, error: parent.error ?? new Error("parent is not a directory") };
    }
    paths.push(parent.path);
    for (const writablePath of paths) {
      if (checked.has(writablePath)) continue;
      try {
        const mode = writablePath === parent.path ? fsConstants.W_OK | fsConstants.X_OK : fsConstants.W_OK;
        accessSync(writablePath, mode);
      } catch (error) {
        return { target: writablePath, error };
      }
      checked.add(writablePath);
    }
  }
  return null;
}
function copyOperations(source, target) {
  return check ? [] : [{ source, target }];
}

function inspectDestinationRoot(target) {
  const ancestorConflict = destinationConflict(path.dirname(target));
  const result = safeLstat(target);
  const conflict = ancestorConflict || (
    result.stat && (!result.stat.isDirectory() || result.stat.isSymbolicLink())
      ? { kind: statType(result.stat), path: target }
      : null
  );
  return { ...result, conflict };
}
function reportInventoryExtras(target, expected, messages) {
  const entriesResult = safeReaddir(target);
  if (entriesResult.error) {
    console.log(messages.error(entriesResult.error));
    markUnsafe();
    return;
  }
  for (const entry of entriesResult.names) {
    if (!expected.has(inventoryKey(entry))) {
      console.log(messages.extra(entry));
      drift = drift || check;
    }
  }
}

function planNoticeFile(source, destination) {
  const sourceResult = safeLstat(source);
  if (!sourceResult.stat && !sourceResult.error) {
    return {
      status: "drift",
      detail: "origem NOTICE ausente — E_INSTALL_DRIFT",
      operations: [],
      unsafe: true,
    };
  }
  if (sourceResult.error || !isRegularFile(sourceResult.stat)) {
    const reason = sourceResult.error
      ? sourceResult.error.message
      : `tipo ${statType(sourceResult.stat)}`;
    return {
      status: "drift",
      detail: `origem NOTICE inválida (${reason}) — E_INSTALL_DRIFT`,
      operations: [],
      unsafe: true,
    };
  }
  const sourceHashResult = safeSha256(source);
  if (sourceHashResult.error) {
    return {
      status: "drift",
      detail: `origem NOTICE inacessível: ${sourceHashResult.error.message} — E_INSTALL_DRIFT`,
      operations: [],
      unsafe: true,
    };
  }

  const ancestorConflict = destinationConflict(path.dirname(destination));
  if (ancestorConflict) {
    return {
      status: "drift",
      detail: `${ancestorConflict.kind} no ancestral ${ancestorConflict.path} — destino preservado — E_INSTALL_DRIFT`,
      operations: [],
      unsafe: true,
    };
  }

  const destinationResult = safeLstat(destination);
  if (destinationResult.error) {
    return {
      status: "drift",
      detail: `destino NOTICE inacessível: ${destinationResult.error.message} — E_INSTALL_DRIFT`,
      operations: [],
      unsafe: true,
    };
  }
  if (!destinationResult.stat) {
    return {
      status: check ? "drift" : "created",
      detail: check ? "ausente" : "instalado",
      operations: copyOperations(source, destination),
      unsafe: false,
    };
  }
  if (!isRegularFile(destinationResult.stat)) {
    return {
      status: "drift",
      detail: `${statType(destinationResult.stat)} no destino — preservado — E_INSTALL_DRIFT`,
      operations: [],
      unsafe: true,
    };
  }
  const destinationHashResult = safeSha256(destination);
  if (destinationHashResult.error) {
    return {
      status: "drift",
      detail: `destino NOTICE inacessível: ${destinationHashResult.error.message} — E_INSTALL_DRIFT`,
      operations: [],
      unsafe: true,
    };
  }
  if (sourceHashResult.hash !== destinationHashResult.hash) {
    return {
      status: check ? "drift" : "updated",
      detail: check ? "divergente (não alterado no --check)" : "atualizado",
      operations: copyOperations(source, destination),
      unsafe: false,
    };
  }
  return { status: "equal", detail: "igual", operations: [], unsafe: false };
}

let drift = false;
let unsafe = false;
const plannedOperations = [];
function recordPlan(result) {
  plannedOperations.push(...result.operations);
  if (result.status === "drift") drift = true;
  if (result.unsafe) unsafe = true;
}
function markUnsafe() {
  drift = true;
  unsafe = true;
}


console.log(check ? "Checando instalação (--check; nada é alterado)..." : "Instalando em ~/.omp/agent/ ...");
const noticeResult = planNoticeFile(noticeSource, noticeDest);
recordPlan(noticeResult);
console.log(`notice                 ${noticeResult.status.padEnd(8)} ${noticeResult.detail}`);

for (const name of SKILLS) {
  const source = sourceInventory(name);
  if (source.issues.length > 0) {
    markUnsafe();
    console.log(`skill ${name.padEnd(18)} drift    ${source.issues.join("; ")} — E_INSTALL_DRIFT`);
    continue;
  }
  const result = planSyncDir(path.join(skillsDest, name), source);
  recordPlan(result);
  console.log(`skill ${name.padEnd(18)} ${result.status.padEnd(8)} ${result.detail}`);
}

const skillsRootResult = inspectDestinationRoot(skillsDest);
if (skillsRootResult.conflict) {
  const conflict = skillsRootResult.conflict;
  console.log(`skill (raiz)          drift    ${conflict.kind} em ${conflict.path}; destino não será alterado — E_INSTALL_DRIFT`);
  markUnsafe();
}
if (skillsRootResult.stat?.isDirectory()) {
  reportInventoryExtras(skillsDest, new Set(SKILLS.map(inventoryKey)), {
    error: (error) => `skill (raiz)          drift    não foi possível ler ${skillsDest}: ${error.code || error.message} — E_INSTALL_DRIFT`,
    extra: (entry) => `skill (extra) ${entry.padEnd(32)} drift    diretório fora do inventário`,
  });
}

const agentsRootResult = inspectDestinationRoot(agentsDest);
if (agentsRootResult.conflict) {
  const conflict = agentsRootResult.conflict;
  console.log(`agent (raiz)           drift    ${conflict.kind} em ${conflict.path}; destino não será alterado — E_INSTALL_DRIFT`);
  markUnsafe();
} else {
  for (const [skill, subdir, file] of AGENTS) {
    const sourcePath = path.join(root, skill, subdir, file);
    const sourceResult = safeLstat(sourcePath);
    const destinationPath = path.join(agentsDest, file);
    const destinationResult = safeLstat(destinationPath);
    if (destinationResult.error) {
      console.log(`agent ${skill}/${file.padEnd(32)} drift    destino inacessível (${destinationResult.error.code || destinationResult.error.message}) — E_INSTALL_DRIFT`);
      markUnsafe();
      continue;
    }
    const project = findProjectAgent(file);
    if (project) {
      console.log(`agent ${file.padEnd(40)} drift    duplicata: projeto precede perfil (${project.path}); perfil não será alterado`);
      markUnsafe();
      continue;
    }
    if (sourceResult.error || !sourceResult.stat || !isRegularFile(sourceResult.stat)) {
      const reason = sourceResult.error ? sourceResult.error.message : sourceResult.stat ? `tipo ${statType(sourceResult.stat)}` : "origem ausente";
      if (destinationResult.stat) {
        console.log(`agent ${skill}/${file.padEnd(32)} drift    stale/obsoleto: origem ausente ou inválida (${reason}); destino preservado`);
      } else {
        console.log(`agent ${skill}/${file.padEnd(32)} FALTA na origem (${reason})`);
      }
      markUnsafe();
      continue;
    }
    const parentConflict = destinationConflict(path.dirname(destinationPath));
    if (parentConflict) {
      console.log(`agent ${skill}/${file.padEnd(32)} drift    ${parentConflict.kind} no ancestral ${parentConflict.path} — destino preservado`);
      markUnsafe();
      continue;
    }
    if (!destinationResult.stat) {
      plannedOperations.push(...copyOperations(sourcePath, destinationPath));
      console.log(`agent ${skill}/${file.padEnd(32)} ${check ? "drift    ausente" : "created  instalado"}`);
      drift = drift || check;
      continue;
    }
    if (!isRegularFile(destinationResult.stat)) {
      console.log(`agent ${skill}/${file.padEnd(32)} drift    ${statType(destinationResult.stat)} no destino — preservado — E_INSTALL_DRIFT`);
      markUnsafe();
      continue;
    }
    if (sha256(sourcePath) !== sha256(destinationPath)) {
      plannedOperations.push(...copyOperations(sourcePath, destinationPath));
      console.log(`agent ${skill}/${file.padEnd(32)} ${check ? "drift    divergente" : "updated  atualizado"}`);
      drift = drift || check;
    } else {
      console.log(`agent ${skill}/${file.padEnd(32)} equal`);
    }
  }

  if (agentsRootResult.stat?.isDirectory()) {
    reportInventoryExtras(agentsDest, new Set(AGENTS.map(([, , file]) => inventoryKey(file))), {
      error: (error) => `agent (raiz)           drift    não foi possível ler ${agentsDest}: ${error.code || error.message} — E_INSTALL_DRIFT`,
      extra: (entry) => `agent (extra) ${entry.padEnd(32)} ${check ? "drift    " : "preservado "}arquivo fora do inventário`,
    });
  }
}

// Probe every target and required parent before the first write. A late
// permission failure must not leave an earlier operation applied.
if (!check && !unsafe) {
  const preflight = preflightOperations(plannedOperations);
  if (preflight) {
    console.error(`E_INSTALL_DRIFT: destino não gravável ${preflight.target}: ${preflight.error?.message || preflight.error}`);
    markUnsafe();
  }
}
if (!check && !unsafe) applyOperations(plannedOperations);

if (check) {
  console.log(drift ? "\nDRIFT detectado — rode `node install.mjs` para sincronizar." : "\nInstalação sincronizada.");
  process.exit(drift ? 1 : 0);
}
if (drift) {
  console.error("\nDRIFT detectado — conflitos exigem correção manual (E_INSTALL_DRIFT).");
  process.exit(1);
}
console.log("\nInstalação concluída. Reinicie a sessão do omp (descoberta ocorre no startup).");
