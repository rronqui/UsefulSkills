#!/usr/bin/env node
// install.mjs — instala (ou confere) as skills e agentes do UsefulSkills.
// Uso:
//   node install.mjs           instala em ~/.omp/agent/ (skills/ e agents/)
//   node install.mjs --check   compara hashes; lista divergências; exit 1 se houver
// Requer: Node >= 18. Não toca nenhum arquivo fora do inventário abaixo.
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const home = os.homedir();
const skillsDest = path.join(home, ".omp", "agent", "skills");
const agentsDest = path.join(home, ".omp", "agent", "agents");
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

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walk(dir, includeSymlinks = false) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, includeSymlinks));
    else if (entry.isFile() || (includeSymlinks && entry.isSymbolicLink())) out.push(full);
  }
  return out;
}

// Compara um diretório-fonte com o destino: retorna { status, detail }.
// status: "equal" | "updated" | "created" | "drift"; conflitos de tipo são drift
// em qualquer modo, enquanto divergências de conteúdo são drift apenas no --check.
function syncDir(src, dest) {
  // Conflito de tipo na RAIZ do destino: arquivo comum onde deveria haver o
  // diretório da skill. Reporta drift sem crashar (walk/readdirSync daria ENOTDIR).
  let destStat = null;
  try {
    destStat = lstatSync(dest);
  } catch {
    // destino ausente
  }
  if (destStat && !destStat.isDirectory()) {
    return { status: "drift", detail: "conflito de tipo na raiz (arquivo onde deveria haver diretório) — remova manualmente" };
  }
  const srcFiles = walk(src).map((f) => path.relative(src, f)).sort();
  let created = 0;
  let updated = 0;
  let equal = 0;
  let typeConflicts = 0;
  const removed = [];
  const srcFileKeys = new Set(srcFiles.map(inventoryKey));
  for (const rel of srcFiles) {
    const s = path.join(src, rel);
    const d = path.join(dest, rel);
    let parentConflict = false;
    let parent = path.dirname(d);
    const boundary = path.dirname(path.dirname(path.dirname(dest)));
    while (true) {
      try {
        const parentStat = lstatSync(parent);
        if (!parentStat.isDirectory()) {
          parentConflict = true;
          break;
        }
      } catch (err) {
        if (err?.code !== "ENOENT") {
          parentConflict = true;
          break;
        }
      }
      if (parent === boundary) break;
      const next = path.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    if (parentConflict) {
      typeConflicts++;
      continue;
    }
    let st = null;
    try {
      st = lstatSync(d);
    } catch {
      // destino ausente
    }
    if (st && (st.isDirectory() || st.isSymbolicLink())) {
      // Conflito de tipo: diretório no destino onde deveria haver arquivo.
      // --check reporta como drift; o modo normal NÃO destrói o diretório.
      typeConflicts++;
      continue;
    }
    if (!st) {
      if (!check) {
        mkdirSync(path.dirname(d), { recursive: true });
        cpSync(s, d);
      }
      created++;
    } else if (sha256(s) !== sha256(d)) {
      if (!check) cpSync(s, d);
      updated++;
    } else {
      equal++;
    }
  }
  const destRoot = (() => { try { return lstatSync(dest); } catch { return null; } })();
  if (destRoot?.isDirectory()) {
    for (const rel of walk(dest, true).map((f) => path.relative(dest, f))) {
      if (!srcFileKeys.has(inventoryKey(rel))) removed.push(rel);
    }
  }
  const srcTopLevel = new Set(readdirSync(src).map(inventoryKey));
  const extraTopLevel = destRoot?.isDirectory()
    ? readdirSync(dest).filter((entry) => !srcTopLevel.has(inventoryKey(entry)))
    : [];
  if (typeConflicts > 0) {
    return { status: "drift", detail: `${typeConflicts} conflito(s) de tipo (arquivo-pai ou diretório onde deveria haver arquivo) — remova manualmente` };
  }
  if (check && extraTopLevel.length > 0) {
    return { status: "drift", detail: `${equal} iguais, ${updated} divergem, ${created} faltam, extras no topo: ${extraTopLevel.join(", ")}` };
  }
  if (check && removed.length > 0) {
    return { status: "drift", detail: `${equal} iguais, ${updated} divergem, ${created} faltam, extras locais: ${removed.join(", ")}` };
  }
  if (updated > 0) return { status: check ? "drift" : "updated", detail: `${updated} arquivo(s) divergentes${check ? " (não alterados no --check)" : " atualizados"}` };
  if (created > 0) return { status: check ? "drift" : "created", detail: `${created} arquivo(s) ${check ? "ausentes" : "instalados"}` };
  return { status: "equal", detail: `${equal} arquivo(s) iguais` };
}
let drift = false;

console.log(check ? "Checando instalação (--check; nada é alterado)..." : "Instalando em ~/.omp/agent/ ...");
let skillsDestStat = null;
try {
  skillsDestStat = lstatSync(skillsDest);
} catch {
  // destino ausente
}
if (skillsDestStat && !skillsDestStat.isDirectory()) {
  console.log("skill (raiz)          drift    conflito de tipo (arquivo onde deveria haver diretório) — remova manualmente");
  drift = true;
} else {
  for (const name of SKILLS) {
    const src = path.join(root, name);
    const dest = path.join(skillsDest, name);
    const { status, detail } = syncDir(src, dest);
    if (status === "drift") drift = true;
    console.log(`skill ${name.padEnd(18)} ${status.padEnd(8)} ${detail}`);
  }
  if (check && skillsDestStat?.isDirectory()) {
    const expected = new Set(SKILLS.map(inventoryKey));
    for (const entry of readdirSync(skillsDest)) {
      if (!expected.has(inventoryKey(entry))) {
        console.log(`skill (extra) ${entry.padEnd(32)} drift    diretório fora do inventário`);
        drift = true;
      }
    }
  }
}

// Conflito de tipo na raiz do destino dos agentes (arquivo onde deveria haver
// diretório): reporta drift e pula sync/scan — readdirSync/mkdirSync dariam ENOTDIR.
let agentsParentConflict = false;
let agentsParent = path.dirname(agentsDest);
const agentsBoundary = path.dirname(path.dirname(agentsDest));
while (true) {
  try {
    if (!lstatSync(agentsParent).isDirectory()) {
      agentsParentConflict = true;
      break;
    }
  } catch (err) {
    if (err?.code !== "ENOENT") {
      agentsParentConflict = true;
      break;
    }
  }
  if (agentsParent === agentsBoundary) break;
  const next = path.dirname(agentsParent);
  if (next === agentsParent) break;
  agentsParent = next;
}
let agentsDestStat = null;
try {
  agentsDestStat = lstatSync(agentsDest);
} catch {
  // destino ausente
}
if (agentsParentConflict || (agentsDestStat && !agentsDestStat.isDirectory())) {
  console.log("agent (raiz)           drift    conflito de tipo no caminho do diretório — remova manualmente");
  drift = true;
} else {
  for (const [skill, subdir, file] of AGENTS) {
    const src = path.join(root, skill, subdir, file);
    const dest = path.join(agentsDest, file);
    const base = `${skill}/${file}`;
    if (!existsSync(src)) {
      console.log(`agent ${base.padEnd(40)} FALTA na origem`);
      drift = true;
      continue;
    }
    let srcStat = null;
    try {
      srcStat = lstatSync(src);
    } catch {
      // origem ausente
    }
    if (!srcStat || !srcStat.isFile() || srcStat.isSymbolicLink()) {
      console.log(`agent ${base.padEnd(40)} FALTA na origem ou symlink não permitido`);
      drift = true;
      continue;
    }
    let st = null;
    try {
      st = lstatSync(dest);
    } catch {
      // destino ausente
    }
    if (st && (st.isDirectory() || st.isSymbolicLink())) {
      console.log(`agent ${base.padEnd(40)} drift    conflito de tipo (diretório no destino)`);
      drift = true;
      continue;
    }
    if (!st) {
      if (!check) {
        mkdirSync(agentsDest, { recursive: true });
        cpSync(src, dest);
      }
      console.log(`agent ${base.padEnd(40)} ${check ? "drift    ausente" : "created  instalado"}`);
      drift = drift || check;
      continue;
    }
    const same = sha256(src) === sha256(dest);
    if (!same) {
      if (!check) cpSync(src, dest);
      console.log(`agent ${base.padEnd(40)} ${check ? "drift    divergente" : "updated  atualizado"}`);
      drift = drift || check;
    } else {
      console.log(`agent ${base.padEnd(40)} equal`);
    }
  }

  // --check: arquivos extras no destino dos agentes também são drift (reportados,
  // nunca removidos — o modo normal não destrói arquivos do usuário).
  if (check && agentsDestStat?.isDirectory()) {
    const expected = new Set(AGENTS.map(([, , file]) => inventoryKey(file)));
    for (const entry of readdirSync(agentsDest)) {
      if (!expected.has(inventoryKey(entry))) {
        console.log(`agent (extra) ${entry.padEnd(32)} drift    arquivo fora do inventário`);
        drift = true;
      }
    }
  }
}

if (check) {
  console.log(drift ? "\nDRIFT detectado — rode `node install.mjs` para sincronizar." : "\nInstalação sincronizada.");
  process.exit(drift ? 1 : 0);
}
if (drift) {
  console.error("\nDRIFT detectado — conflitos exigem correção manual.");
  process.exit(1);
}
console.log("\nInstalação concluída. Reinicie a sessão do omp (descoberta ocorre no startup).");
