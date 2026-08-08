#!/usr/bin/env node
// ship.mjs — motor determinístico do fluxo de releases (skill "ship").
// Subcomandos: setup | new | ship | deploy. Requer: git, gh autenticado, Node >= 18.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractIssueNumber, extractServedVersion, flagValue, isValidSemVer, performBackup, resolveSchemaWatch, slugify } from "./lib.mjs";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const CONFIG = path.join(root, "ship.config.json");
function readConfig() {
  const value = JSON.parse(readFileSync(CONFIG, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ship.config.json deve conter um objeto JSON");
  }
  return value;
}

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
  const originalBranch = git(["branch", "--show-current"]);
  let originalHead = "";
  try {
    originalHead = git(["rev-parse", "--verify", "HEAD"]);
  } catch {
    // orphan branches have no HEAD to restore
  }
  const def = defaultBranch();
  const restoreBranch = () => {
    try {
      if (originalBranch && originalBranch !== def) {
        try {
          git(["switch", "--no-guess", originalBranch]);
        } catch {
          git(["symbolic-ref", "HEAD", `refs/heads/${originalBranch}`]);
        }
      } else if (!originalBranch && originalHead) {
        git(["switch", "--detach", originalHead]);
      }
    } catch {
      // preserve the original failure if restoration is unavailable
    }
  };
  try {
    git(["switch", def]);
    git(["pull", "--ff-only"]);
  } catch {
    restoreBranch();
    console.error(`Não consegui atualizar a branch default '${def}' antes de criar a issue. Nenhuma issue foi criada.`);
    process.exit(1);
  }
  const label = type === "fix" ? "bug" : "enhancement";
  let url;
  try {
    url = gh([
      "issue", "create",
      "--title", `[${type === "fix" ? "bug" : "feat"}] ${title}`,
      "--label", label,
      "--body", desc || "—",
    ]);
  } catch (err) {
    restoreBranch();
    throw err;
  }
  const n = extractIssueNumber(url);
  if (n === null) {
    restoreBranch();
    console.error(`Não consegui extrair o número da issue/PR de: ${url}`);
    process.exit(1);
  }
  const branch = `${type}/${n}-${slugify(title)}`;
  try {
    git(["switch", "-c", branch]);
  } catch (err) {
    restoreBranch();
    let closed = true;
    try {
      gh(["issue", "close", n, "--comment", "Issue fechada automaticamente: não foi possível criar a branch correspondente."]);
    } catch {
      closed = false;
      console.error(`Não consegui fechar a issue ${n} após a falha de criação da branch.`);
    }
    console.error(
      closed
        ? `Não consegui criar a branch ${branch}; a issue ${n} foi fechada para não ficar órfã.`
        : `Não consegui criar a branch ${branch}; a issue ${n} permanece aberta e requer ação manual.`,
    );
    process.exit(1);
  }
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
      let def;
      try {
        def = defaultBranch();
        const branchCommits = Number(git(["rev-list", "--count", `origin/${def}..HEAD`]));
        if (!branchCommits) {
          console.error("Nada para commitar.");
          process.exit(1);
        }
      } catch {
        console.warn("Não consegui comparar com a branch default local; tentando criar o PR mesmo assim.");
        console.log("Árvore limpa — branch já publicada; tentando criar o PR.");
      }
    } else {
      console.log(`Árvore limpa — publicando ${unpublished} commit(s) local(is) não publicado(s).`);
    }
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
  let cfg;
  try {
    cfg = readConfig();
  } catch {
    console.error("ship.config.json ausente ou inválido — deploy cancelado.");
    process.exit(1);
  }
  const def = defaultBranch();
  const cur = git(["branch", "--show-current"]);
  if (cur !== def) {
    console.error(`Deploy roda na branch default (${def}); a atual é '${cur}'.`);
    process.exit(1);
  }
  try {
    git(["fetch", "origin", def]);
    const ahead = Number(git(["rev-list", "--count", `origin/${def}..HEAD`]));
    if (ahead > 0) {
      console.error(`Deploy bloqueado: a branch '${def}' tem ${ahead} commit(s) local(is) à frente de origin/${def}. Publique ou reconcilie antes de tentar o deploy.`);
      process.exit(1);
    }
  } catch {
    console.error(`Não consegui verificar se '${def}' está alinhada com origin/${def}; deploy cancelado por segurança.`);
    process.exit(1);
  }
  const oldHead = git(["rev-parse", "HEAD"]);
  const backupDest = performBackup(cfg, root);
  if (backupDest) console.log(`Backup: ${backupDest}`);
  else if (cfg.dbPath) console.warn(`Backup pulado: '${cfg.dbPath}' no manifesto não existe no repo.`);
  try {
    git(["pull", "--ff-only"]);
  } catch {
    console.error(`git pull --ff-only falhou — ${def} local divergente do origin (commits fora do fluxo?). Reconcilie manualmente e rode deploy de novo.`);
    process.exit(1);
  }
  try {
    cfg = readConfig();
  } catch {
    console.error("ship.config.json ficou ausente ou inválido após o pull — deploy cancelado.");
    process.exit(1);
  }
  const changed = git(["diff", "--name-only", oldHead, "HEAD"])
    .split("\n")
    .map((file) => file.trim().replaceAll("\\", "/"))
    .filter(Boolean);
  const watch = resolveSchemaWatch(cfg.schemaWatchPaths);
  const hits = watch.filter((watched) => {
    const absolute = path.resolve(root, watched);
    const relative = path.relative(root, absolute).replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
    return changed.some((file) => !relative || file === relative || file.startsWith(`${relative}/`));
  });
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
    let packageRead = true;
    try {
      pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    } catch {
      packageRead = false;
      console.warn("versionCheckUrl configurado mas package.json ausente/inválido na raiz — checagem de versão pulada.");
    }
    const validVersion = isValidSemVer(pkg?.version);
    if (packageRead && !validVersion) {
      console.warn("versionCheckUrl configurado mas package.version ausente ou inválido — checagem de versão pulada.");
    }
    if (validVersion) {
      let ok = false;
      const timeoutValue = Number(cfg.versionCheckTimeoutMs);
      const timeoutMs = Number.isFinite(timeoutValue) && timeoutValue > 0
        ? Math.min(timeoutValue, 2_147_483_647)
        : 10_000;
      for (let attempt = 0; attempt < 5 && !ok; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(cfg.versionCheckUrl, { signal: controller.signal });
          if (!response || response.ok === false || (typeof response.status === "number" && (response.status < 200 || response.status >= 300))) {
            await response?.body?.cancel();
            throw new Error(`HTTP ${response?.status ?? "desconhecido"}`);
          }
          const html = await response.text();
          const served = extractServedVersion(html);
          console.log(
            served === pkg.version
              ? `Versão servida confere: v${served}`
              : `AVISO: versão servida v${served ?? "?"} ≠ package.json v${pkg.version}`,
          );
          ok = true;
        } catch {
          if (attempt < 4) await new Promise((r) => setTimeout(r, 2_000));
        } finally {
          clearTimeout(timer);
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
