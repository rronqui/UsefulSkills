#!/usr/bin/env node
// ship.mjs — motor determinístico do fluxo de releases (skill "ship").
// Subcomandos: setup | new | ship | deploy. Requer: git, gh autenticado, Node >= 20.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
function backupDirFor(cfg) {
  if (!cfg.dbPath) return null;
  return path.resolve(root, cfg.backupDir ?? path.join(path.dirname(cfg.dbPath), "backup"));
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
function fail(message) {
  console.error(message);
  process.exit(1);
}

function versionSourceError(message) {
  throw new Error(message);
}

function readJsonObject(file, label) {
  let value;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    versionSourceError(`${label} ausente ou inválido`);
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    versionSourceError(`${label} deve conter um objeto JSON`);
  }
  return value;
}

function pathInsideRepo(realPath, label) {
  const repoPath = realpathSync(root);
  const relative = path.relative(repoPath, realPath);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    versionSourceError(`${label} está fora do repositório`);
  }
}
function repoRegularPath(file, label) {
  let stats;
  try {
    stats = lstatSync(file);
  } catch {
    versionSourceError(`${label} ausente ou inacessível`);
  }
  if (stats.isSymbolicLink() || !stats.isFile()) {
    versionSourceError(`${label} deve ser um arquivo regular dentro do repositório`);
  }
  let realPath;
  try {
    realPath = realpathSync(file);
  } catch {
    versionSourceError(`${label} inacessível`);
  }
  pathInsideRepo(realPath, label);
  return realPath;
}

function releaseConfigPathOrNull(file) {
  let stats;
  try {
    stats = lstatSync(file);
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    versionSourceError(`release-please-config.json inacessível`);
  }
  if (stats.isSymbolicLink()) {
    versionSourceError("release-please-config.json não pode ser um link simbólico");
  }
  if (!stats.isFile()) {
    versionSourceError("release-please-config.json não é um arquivo regular");
  }
  try {
    const realPath = realpathSync(file);
    pathInsideRepo(realPath, "release-please-config.json");
    return realPath;
  } catch (err) {
    if (err?.message?.includes("fora do repositório")) throw err;
    versionSourceError("release-please-config.json inacessível");
  }
}

function packagePathForUnit(unit) {
  if (typeof unit !== "string" || !unit.trim() || path.isAbsolute(unit)) {
    versionSourceError(`unidade '${String(unit)}' não é um caminho de package válido`);
  }
  const packagePath = path.resolve(root, unit, "package.json");
  const relative = path.relative(root, packagePath);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) {
    versionSourceError(`unidade '${unit}' está fora do repositório`);
  }
  let realPackagePath;
  try {
    realPackagePath = realpathSync(packagePath);
  } catch {
    versionSourceError(`package.json da unidade '${unit}' inacessível ou ausente`);
  }
  pathInsideRepo(realPackagePath, `package.json da unidade '${unit}'`);
  return realPackagePath;
}

function validateVersionSources() {
  const rootPackagePath = path.join(root, "package.json");
  const releaseConfigPath = path.join(root, "release-please-config.json");
  const releaseConfigRealPath = releaseConfigPathOrNull(releaseConfigPath);
  if (!releaseConfigRealPath) {
    const rootPackage = readJsonObject(repoRegularPath(rootPackagePath, "package.json raiz"), "package.json raiz");
    if (!isValidSemVer(rootPackage.version)) {
      versionSourceError("package.json raiz não contém uma versão SemVer resolvível");
    }
    return;
  }

  const releaseConfig = readJsonObject(releaseConfigRealPath, "release-please-config.json");
  const packages = releaseConfig.packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages) || !Object.keys(packages).length) {
    versionSourceError("release-please-config.json não declara unidades em packages");
  }

  const manifestPath = path.join(root, ".release-please-manifest.json");
  const manifest = readJsonObject(repoRegularPath(manifestPath, ".release-please-manifest.json"), ".release-please-manifest.json");
  const units = Object.keys(packages);
  const manifestUnits = Object.keys(manifest);
  if (manifestUnits.length !== units.length || units.some((unit) => !Object.hasOwn(manifest, unit))) {
    versionSourceError("manifesto release-please não corresponde às unidades declaradas em packages");
  }

  for (const unit of units) {
    const unitConfig = packages[unit];
    if (!unitConfig || typeof unitConfig !== "object" || Array.isArray(unitConfig) || unitConfig["release-type"] !== "node") {
      versionSourceError(`unidade '${unit}' não usa uma fonte release-please Node`);
    }
    if (!isValidSemVer(unitConfig["initial-version"])) {
      versionSourceError(`initial-version inválida para a unidade '${unit}'`);
    }
    const packagePath = packagePathForUnit(unit);
    const packageJson = readJsonObject(packagePath, `package.json da unidade '${unit}'`);
    if (!isValidSemVer(packageJson.version)) {
      versionSourceError(`package.json da unidade '${unit}' não contém uma versão SemVer resolvível`);
    }
    if (!isValidSemVer(manifest[unit])) {
      versionSourceError(`versão inválida no manifesto para a unidade '${unit}'`);
    }
    if (manifest[unit] !== packageJson.version) {
      versionSourceError(`manifesto e package.json divergem para a unidade '${unit}'`);
    }
  }
}


function requireVersionSources() {
  try {
    validateVersionSources();
  } catch (err) {
    fail(`E_VERSION_SOURCE: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function requireGhAuth() {
  try {
    gh(["auth", "status"]);
  } catch {
    fail("Pré-requis ausente: gh não está autenticado. Execute 'gh auth login' e tente novamente.");
  }
}

function requirePushRemote() {
  try {
    git(["remote", "get-url", "--push", "origin"]);
  } catch {
    fail("Pré-requisito ausente: remote de push 'origin' indisponível. Configure git remote antes de continuar.");
  }
}

function requiredLabel(type) {
  return type === "fix" ? "bug" : "enhancement";
}

function requireLabel(type) {
  const label = requiredLabel(type);
  try {
    const raw = gh(["api", `repos/${repoSlug()}/labels`, "--paginate", "-q", ".[].name"]);
    const labels = raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    if (!labels.includes(label)) throw new Error(`label ${label} ausente`);
  } catch {
    fail(`Pré-requisito ausente: a label '${label}' não existe no repositório. Crie-a antes de continuar.`);
  }
}

function releaseDescription(raw) {
  let description = raw.trim();
  let breaking = /BREAKING\s+CHANGE\s*:/i.test(description);
  const prefixed = description.match(/^(?:fix|feat)(!)?:\s*/i);
  if (prefixed) {
    breaking ||= Boolean(prefixed[1]);
    description = description.slice(prefixed[0].length).trim();
  }
  if (/^!:\s*/.test(description)) {
    breaking = true;
    description = description.replace(/^!:\s*/, "");
  }
  return { description, breaking };
}

function releaseTitle(type, raw, issue = null) {
  const { description, breaking } = releaseDescription(raw);
  const prefix = `${type}${breaking ? "!" : ""}: `;
  const suffix = issue === null ? "" : ` (#${issue})`;
  const available = Math.max(1, 72 - prefix.length - suffix.length);
  return `${prefix}${description.slice(0, available)}${suffix}`;
}


function mergePrBody(existingBody, payload, issue) {
  const closes = new RegExp(`^\\s*Closes\\s+#${issue}\\s*$`, "i");
  const breaking = /^\s*BREAKING\s+CHANGE\s*:/i;
  const existingLines = String(existingBody ?? "").split("\n");
  let hasClose = false;
  let hasBreaking = false;
  const canonicalLines = [];
  for (const line of existingLines) {
    if (closes.test(line)) {
      if (!hasClose) {
        canonicalLines.push(`Closes #${issue}`);
        hasClose = true;
      }
    } else if (breaking.test(line)) {
      if (!hasBreaking) {
        canonicalLines.push(line);
        hasBreaking = true;
      }
    } else {
      canonicalLines.push(line);
    }
  }

  let payloadHasClose = false;
  const payloadBreaking = [];
  const payloadContent = [];
  for (const line of String(payload ?? "").split("\n")) {
    if (closes.test(line)) {
      payloadHasClose = true;
    } else if (breaking.test(line)) {
      if (!hasBreaking && !payloadBreaking.length) payloadBreaking.push(line);
    } else {
      payloadContent.push(line);
    }
  }
  const sanitized = [...payloadBreaking, ...payloadContent].join("\n");
  const markerOnlyPayload = !payloadContent.some((line) => line.trim()) && (payloadHasClose || payloadBreaking.length > 0);
  let body = canonicalLines.join("\n");

  if (!hasClose && payloadHasClose) {
    body = body.trim()
      ? `Closes #${issue}${markerOnlyPayload ? "\n" : "\n\n"}${body}`
      : `Closes #${issue}`;
    hasClose = true;
  }
  if (markerOnlyPayload) {
    if (payloadBreaking.length && !hasBreaking) {
      body = body.trim() ? `${body}\n${payloadBreaking[0]}` : payloadBreaking[0];
    }
    return body;
  }
  if (!sanitized.trim()) return body;
  if (body.endsWith(sanitized)) return body;
  return `${body}${sanitized.startsWith("\n") ? sanitized : `\n\n${sanitized}`}`;
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
  requireVersionSources();
  requireGhAuth();
  requirePushRemote();
  requireLabel(type);
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
          if (originalHead) {
            try {
              git(["switch", "--discard-changes", "--no-guess", originalBranch]);
            } catch {
              git(["switch", "--detach", originalHead]);
            }
          } else {
            git(["symbolic-ref", "HEAD", `refs/heads/${originalBranch}`]);
            git(["read-tree", "--empty"]);
            git(["clean", "-fd"]);
          }
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
  const rawDescription = argv.join(" ").trim();
  if (!rawDescription) usage();
  const branch = git(["branch", "--show-current"]);
  const m = branch.match(/^(fix|feat)\/(\d+)-/);
  if (!m) {
    console.error(`Branch atual '${branch}' não segue fix/#N-… ou feat/#N-… — use 'ship.mjs new' primeiro.`);
    process.exit(1);
  }
  const [, type, n] = m;
  requireVersionSources();
  requireGhAuth();
  requirePushRemote();
  const repository = repoSlug();
  let def = "";
  let prUrl = "";
  try {
    def = defaultBranch();
    prUrl = gh([
      "pr", "list", "--head", branch, "--base", def, "--state", "open",
      "--json", "url,headRepository",
      "-q", `map(select(.headRepository.nameWithOwner == "${repository}")) | .[0].url`,
    ]);
    if (prUrl === "null") prUrl = "";
  } catch {
    fail("Não consegui determinar a branch default/PR existente; nenhuma alteração foi publicada.");
  }
  if (!prUrl) requireLabel(type);
  let bodyExtra = "";
  if (bodyFile) {
    const bodyPath = path.resolve(root, bodyFile);
    if (!existsSync(bodyPath)) {
      console.error(`--body-file: arquivo não encontrado: ${bodyFile}`);
      process.exit(1);
    }
    const rawPayload = readFileSync(bodyPath, "utf8");
    if (rawPayload.trim()) bodyExtra = `\n\n${rawPayload}`;
  }
  const commitTitle = releaseTitle(type, rawDescription, n);
  const { description } = releaseDescription(rawDescription);
  git(["add", "-A"]);
  if (spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: root }).status === 0) {
    const unpublished = Number(git(["rev-list", "--count", "HEAD", "--not", "--remotes"]));
    if (!unpublished) {
      try {
        git(["fetch", "origin", def]);
        const branchCommits = Number(git(["rev-list", "--count", `origin/${def}..HEAD`]));
        if (!branchCommits) {
          console.error("Nada para commitar.");
          process.exit(1);
        }
      } catch {
        console.warn("Não consegui comparar com a branch default local; tentando criar o PR mesmo assim.");
      }
    } else {
      console.log(`Árvore limpa — publicando ${unpublished} commit(s) local(is) não publicado(s).`);
    }
  } else {
    git(["commit", "-m", commitTitle]);
  }
  try {
    git(["push", "-u", "origin", branch]);
  } catch {
    fail("Falha no remote de push; commit local preservado, mas PR não foi criado.");
  }
  if (!prUrl) {
    prUrl = gh([
      "pr", "create",
      "--base", def,
      "--title", releaseTitle(type, rawDescription),
      "--body", mergePrBody(`Closes #${n}\n\n${description}`, bodyExtra, n),
    ]);
  } else if (bodyExtra) {
    const existingBodyJson = gh(["pr", "view", prUrl, "--json", "body"]);
    const existingBody = JSON.parse(existingBodyJson).body ?? "";
    const mergedBody = mergePrBody(existingBody, bodyExtra, n);
    if (mergedBody !== existingBody) gh(["pr", "edit", prUrl, "--body", mergedBody]);
  }
  console.log(`PR ${prUrl}`);
  const auto = spawnSync("gh", ["pr", "merge", prUrl, "--auto", "--squash"], { cwd: root, encoding: "utf8" });
  if (auto.status === 0) console.log("Auto-merge habilitado — o PR mergeia quando o CI ficar verde.");
  else console.warn("Auto-merge não habilitado (repo sem allow_auto_merge?) — mergue manualmente após o CI.");
}
function restoreStoppedDeployment(oldHead, oldCfg) {
  const failures = [];
  try {
    git(["reset", "--hard", oldHead]);
  } catch (err) {
    failures.push(`não consegui restaurar o revision ${oldHead}: ${err?.message ?? err}`);
  }
  if (oldCfg.buildCommand) {
    try {
      if (!runShell(oldCfg.buildCommand)) failures.push("o build da revisão anterior falhou");
    } catch (err) {
      failures.push(`o build da revisão anterior falhou: ${err?.message ?? err}`);
    }
  }
  if (oldCfg.startCommand) {
    try {
      if (!runShell(oldCfg.startCommand)) failures.push("o startCommand da revisão anterior falhou");
    } catch (err) {
      failures.push(`o startCommand da revisão anterior falhou: ${err?.message ?? err}`);
    }
  } else {
    failures.push("startCommand da revisão anterior não está configurado");
  }
  if (failures.length) {
    console.error(`Rollback do deploy incompleto: ${failures.join("; ")}.`);
  } else {
    console.error(`Rollback do deploy concluído: revisão ${oldHead} restaurada e servidor reiniciado.`);
  }
}

function failAfterStoppedDeploy(stopped, oldHead, oldCfg, message) {
  console.error(message);
  if (stopped) restoreStoppedDeployment(oldHead, oldCfg);
  process.exit(1);
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
  if (git(["status", "--porcelain"]) !== "") {
    console.error(`Deploy bloqueado: a árvore da branch default '${def}' está suja. Faça commit ou descarte as mudanças antes de continuar.`);
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
  const oldCfg = cfg;
  const prePullDbPath = cfg.dbPath;
  const prePullBackupDir = backupDirFor(cfg);
  let stopped = false;
  if (cfg.stopCommand !== null && cfg.stopCommand !== undefined && (typeof cfg.stopCommand !== "string" || !cfg.stopCommand.trim())) {
    if (cfg.dbPath) {
      console.error("Deploy cancelado: dbPath configurado exige stopCommand (ou estratégia explícita de quiescência) antes do snapshot.");
      process.exit(1);
    }
    console.warn("stopCommand configurado inválido — deploy continuará sem conseguir parar o servidor.");
  } else if (typeof cfg.stopCommand === "string" && cfg.stopCommand.trim()) {
    if (!runShell(cfg.stopCommand)) {
      if (cfg.dbPath) {
        console.error("Deploy cancelado: stopCommand não comprovou quiescência; nenhum snapshot ou pull foi executado.");
        process.exit(1);
      }
      console.warn("stopCommand falhou; continuando o deploy porque dbPath não está configurado.");
    } else {
      stopped = true;
    }
  } else if (cfg.dbPath) {
    console.error("Deploy cancelado: dbPath configurado exige stopCommand (ou estratégia explícita de quiescência) antes do snapshot.");
    process.exit(1);
  }
  let backupDest;
  try {
    backupDest = performBackup(cfg, root);
  } catch (err) {
    failAfterStoppedDeploy(stopped, oldHead, oldCfg, `Backup falhou: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (backupDest) console.log(`Backup: ${backupDest}`);
  else if (cfg.dbPath) console.warn(`Backup pulado: '${cfg.dbPath}' no manifesto não existe no repo.`);
  try {
    git(["pull", "--ff-only", "origin", def]);
  } catch {
    failAfterStoppedDeploy(
      stopped,
      oldHead,
      oldCfg,
      `git pull --ff-only falhou — ${def} local divergente do origin (commits fora do fluxo?). Reconcilie manualmente e rode deploy de novo.`,
    );
  }
  try {
    cfg = readConfig();
  } catch {
    failAfterStoppedDeploy(stopped, oldHead, oldCfg, "ship.config.json ficou ausente ou inválido após o pull — deploy cancelado.");
  }
  if (cfg.dbPath !== prePullDbPath || backupDirFor(cfg) !== prePullBackupDir) {
    if (cfg.dbPath) {
      if (!cfg.stopCommand || !runShell(cfg.stopCommand)) {
        failAfterStoppedDeploy(stopped, oldHead, oldCfg, "Deploy cancelado: a configuração pós-pull não comprovou quiescência para o snapshot.");
      }
      stopped = true;
    }
    let postPullBackup;
    try {
      postPullBackup = performBackup(cfg, root);
    } catch (err) {
      failAfterStoppedDeploy(stopped, oldHead, oldCfg, `Backup pós-pull falhou: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (postPullBackup) console.log(`Backup pós-pull: ${postPullBackup}`);
    else if (cfg.dbPath) console.warn(`Backup pulado: '${cfg.dbPath}' no manifesto não existe no repo.`);
  }
  const changed = git(["diff", "--name-only", oldHead, "HEAD"])
    .split("\n")
    .map((file) => file.replace(/\r$/, "").replaceAll("\\", "/"))
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
    failAfterStoppedDeploy(stopped, oldHead, oldCfg, "Build falhou — a revisão nova não foi iniciada.");
  }
  if (cfg.startCommand && !runShell(cfg.startCommand)) {
    failAfterStoppedDeploy(stopped, oldHead, oldCfg, "Start falhou — veja a saída acima / o log do seu startCommand.");
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
      const timeoutValue = cfg.versionCheckTimeoutMs;
      const timeoutMs = typeof timeoutValue === "number" && Number.isFinite(timeoutValue) && timeoutValue > 0
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
