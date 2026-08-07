#!/usr/bin/env node
// ship.mjs — motor determinístico do fluxo de releases (skill "ship").
// Subcomandos: setup | new | ship | deploy. Requer: git, gh autenticado, Node >= 18.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractIssueNumber, extractServedVersion, flagValue, resolveSchemaWatch, slugify } from "./lib.mjs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const CONFIG = path.join(root, "ship.config.json");

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8", cwd: root }).trim();
}
function git(args) {
  return execFileSync("git", args, { encoding: "utf8", cwd: root }).trim();
}
function runShell(command) {
  return spawnSync(command, { shell: true, cwd: root, stdio: "inherit" }).status === 0;
}
function repoSlug() {
  return gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
}
function defaultBranch() {
  return gh(["api", `repos/${repoSlug()}`, "-q", ".default_branch"]);
}
function usage() {
  console.log(`Uso:
  ship.mjs setup
  ship.mjs new (--bug <título> | --feat <título>) [--desc <texto>]
  ship.mjs ship <descrição> [--body-file <arquivo>]
  ship.mjs deploy`);
  process.exit(1);
}

function issueNumberOrDie(url) {
  const n = extractIssueNumber(url);
  if (n === null) {
    console.error(`Não consegui extrair o número da issue/PR de: ${url}`);
    process.exit(1);
  }
  return n;
}


// ---------- setup ----------
function setup() {
  if (existsSync(CONFIG)) {
    console.log("ship.config.json já existe:");
    console.log(readFileSync(CONFIG, "utf8"));
    return;
  }
  writeFileSync(
    CONFIG,
    JSON.stringify(
      { dbPath: null, buildCommand: null, stopCommand: null, startCommand: null, versionCheckUrl: null },
      null,
      2,
    ) + "\n",
  );
  const gi = path.join(root, ".gitignore");
  if (existsSync(gi) && !readFileSync(gi, "utf8").split("\n").includes(".omp/")) {
    appendFileSync(gi, ".omp/\n");
    console.log(".omp/ adicionado ao .gitignore");
  }
  console.log("ship.config.json criado — edite com os valores do projeto.");
}

// ---------- new ----------
function cmdNew(argv) {
  const bug = flagValue(argv, "--bug");
  const feat = flagValue(argv, "--feat");
  const desc = flagValue(argv, "--desc");
  if ((bug && feat) || (!bug && !feat)) usage();
  const type = bug ? "fix" : "feat";
  const title = bug || feat;
  if (git(["status", "--porcelain"]) !== "") {
    console.error("Working tree sujo — commit ou descarte as mudanças antes.");
    process.exit(1);
  }
  const def = defaultBranch();
  const label = type === "fix" ? "bug" : "enhancement";
  const url = gh([
    "issue", "create",
    "--title", `[${type === "fix" ? "bug" : "feat"}] ${title}`,
    "--label", label,
    "--body", desc || "—",
  ]);
  const n = issueNumberOrDie(url);
  const branch = `${type}/${n}-${slugify(title)}`;
  git(["switch", def]);
  git(["pull", "--ff-only"]);
  git(["switch", "-c", branch]);
  console.log(`Issue ${url}`);
  console.log(`Branch ${branch} criada a partir de ${def}.`);
}

// ---------- ship ----------
function cmdShip(argv) {
  const bodyFile = flagValue(argv, "--body-file");
  const flagIndex = argv.indexOf("--body-file");
  if (flagIndex !== -1) {
    if (!bodyFile) usage();
    argv = argv.filter((_, i) => i !== flagIndex && i !== flagIndex + 1);
  }
  const description = argv.join(" ").trim();
  if (!description) usage();
  const branch = git(["branch", "--show-current"]);
  const m = branch.match(/^(fix|feat)\/(\d+)-/);
  if (!m) {
    console.error(`Branch atual '${branch}' não segue fix/#N-… ou feat/#N-… — use 'ship.mjs new' primeiro.`);
    process.exit(1);
  }
  const [, type, n] = m;
  let bodyExtra = "";
  if (bodyFile) {
    const bodyPath = path.resolve(root, bodyFile);
    if (!existsSync(bodyPath)) {
      console.error(`--body-file: arquivo não encontrado: ${bodyFile}`);
      process.exit(1);
    }
    bodyExtra = `\n\n${readFileSync(bodyPath, "utf8").trim()}`;
  }
  git(["add", "-A"]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root }).status === 0) {
    const unpublished = Number(git(["rev-list", "--count", "HEAD", "--not", "--remotes"]));
    if (!unpublished) {
      console.error("Nada para commitar.");
      process.exit(1);
    }
    console.log(`Árvore limpa — publicando ${unpublished} commit(s) local(is) não publicado(s).`);
  } else {
    git(["commit", "-m", `${type}: ${description} (#${n})`]);
  }
  git(["push", "-u", "origin", branch]);
  const prUrl = gh([
    "pr", "create",
    "--title", `${type}: ${description}`,
    "--body", `Closes #${n}\n\n${description}${bodyExtra}`,
  ]);
  console.log(`PR ${prUrl}`);
  const auto = spawnSync("gh", ["pr", "merge", "--auto", "--squash"], { cwd: root, encoding: "utf8" });
  if (auto.status === 0) console.log("Auto-merge habilitado — o PR mergeia quando o CI ficar verde.");
  else console.warn("Auto-merge não habilitado (repo sem allow_auto_merge?) — mergue manualmente após o CI.");
}

// ---------- deploy ----------
async function deploy() {
  if (!existsSync(CONFIG)) {
    console.error("ship.config.json ausente — rode 'ship.mjs setup' e preencha.");
    process.exit(1);
  }
  const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
  const def = defaultBranch();
  const cur = git(["branch", "--show-current"]);
  if (cur !== def) {
    console.error(`Deploy roda na branch default (${def}); a atual é '${cur}'.`);
    process.exit(1);
  }
  const oldHead = git(["rev-parse", "HEAD"]);
  if (cfg.dbPath && existsSync(path.join(root, cfg.dbPath))) {
    // backupDir opcional no manifesto; default: <dirname(dbPath)>/backup.
    // path.resolve honra absolutos; relativos resolvem contra a raiz do repo.
    const backupDir = path.resolve(root, cfg.backupDir ?? path.join(path.dirname(cfg.dbPath), "backup"));
    const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    const dest = path.join(backupDir, `${path.basename(cfg.dbPath)}-${ts}`);
    copyFileSync(path.join(root, cfg.dbPath), dest);
    console.log(`Backup: ${dest}`);
  } else if (cfg.dbPath) {
    console.warn(`Backup pulado: '${cfg.dbPath}' no manifesto não existe no repo.`);
  }
  try {
    git(["pull", "--ff-only"]);
  } catch {
    console.error(`git pull --ff-only falhou — ${def} local divergente do origin (commits fora do fluxo?). Reconcilie manualmente e rode deploy de novo.`);
    process.exit(1);
  }
  const changed = git(["diff", "--name-only", oldHead, "HEAD"]).split("\n");
  // schemaWatchPaths opcional no manifesto (string[]); omitido → default legado.
  const watch = resolveSchemaWatch(cfg.schemaWatchPaths);
  const hits = watch.filter((p) => typeof p === "string" && changed.includes(p));
  if (hits.length) {
    console.warn(`ATENÇÃO: possível migração de schema neste pull: ${hits.join(", ")} (forward-only).`);
  }
  if (cfg.buildCommand && !runShell(cfg.buildCommand)) {
    console.error("Build falhou — servidor antigo continua no ar.");
    process.exit(1);
  }
  if (cfg.stopCommand && !runShell(cfg.stopCommand)) {
    console.warn("stopCommand retornou não-zero — confira se o servidor antigo realmente parou.");
  }
  if (cfg.startCommand && !runShell(cfg.startCommand)) {
    console.error("Start falhou — veja a saída acima / o log do seu startCommand.");
    process.exit(1);
  }
  if (cfg.versionCheckUrl) {
    let pkg = null;
    try {
      pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    } catch {
      console.warn("versionCheckUrl configurado mas package.json ausente/inválido na raiz — checagem de versão pulada.");
    }
    if (pkg) {
      let ok = false;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        try {
          const html = await (await fetch(cfg.versionCheckUrl)).text();
          const served = extractServedVersion(html);
          console.log(
            served === pkg.version
              ? `Versão servida confere: v${served}`
              : `AVISO: versão servida v${served ?? "?"} ≠ package.json v${pkg.version}`,
          );
          ok = true;
        } catch {
          if (attempt < 4) await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (!ok) console.warn(`Não consegui checar versão em ${cfg.versionCheckUrl} após 5 tentativas.`);
    }
  }
  console.log("Deploy concluído.");
}

// ---------- dispatch ----------
const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === "setup") setup();
  else if (cmd === "new") cmdNew(rest);
  else if (cmd === "ship") cmdShip(rest);
  else if (cmd === "deploy") await deploy();
  else usage();
} catch (err) {
  if (err && err.code === "ENOENT") {
    const bin = typeof err.syscall === "string" ? err.syscall.replace(/^spawn(Sync)?\s*/i, "") : "binário";
    console.error(`ship.mjs: binário ausente ou fora do PATH: ${bin}. Instale/corrija (git, gh) e rode de novo.`);
  } else {
    console.error(`ship.mjs: ${err?.message ?? err}`);
  }
  process.exit(1);
}
