#!/usr/bin/env node
// ship.mjs — motor determinístico do fluxo de releases (skill "ship").
// Subcomandos: setup | new | ship | deploy. Requer: git, gh autenticado, Node >= 20.
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { extractServedVersion, flagValue, isValidSemVer, performBackup, resolveSchemaWatch, slugify } from "./lib.mjs";

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
  return repoRegularPath(packagePath, `package.json da unidade '${unit}'`);
}

function validateVersionSources() {
  const rootPackagePath = path.join(root, "package.json");
  const releaseConfigPath = path.join(root, "release-please-config.json");
  const releaseConfigRealPath = releaseConfigPathOrNull(releaseConfigPath);
  const versions = new Map();
  if (!releaseConfigRealPath) {
    const rootPackage = readJsonObject(repoRegularPath(rootPackagePath, "package.json raiz"), "package.json raiz");
    if (!isValidSemVer(rootPackage.version)) {
      versionSourceError("package.json raiz não contém uma versão SemVer resolvível");
    }
    versions.set(".", rootPackage.version);
    return versions;
  }

  const releaseConfig = readJsonObject(releaseConfigRealPath, "release-please-config.json");
  const packages = releaseConfig.packages;
  if (!packages || typeof packages !== "object" || Array.isArray(packages) || !Object.keys(packages).length) {
    versionSourceError("release-please-config.json não declara unidades em packages");
  }
  if (Object.hasOwn(releaseConfig, "release-as")) {
    versionSourceError("release-please-config.json não pode congelar a versão com release-as");
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
    if (units.length > 1 && unitConfig["include-component-in-tag"] !== true) {
      versionSourceError(`unidade '${unit}' deve exigir include-component-in-tag=true para múltiplas unidades`);
    }
    if (Object.hasOwn(unitConfig, "release-as")) {
      versionSourceError(`unidade '${unit}' não pode congelar a versão com release-as`);
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
    versions.set(unit, packageJson.version);
  }
  return versions;
}

function requireVersionSources() {
  try {
    return validateVersionSources();
  } catch (err) {
    fail(`E_VERSION_SOURCE: ${err instanceof Error ? err.message : String(err)}`);
  }
}
function validateVersionCheckUnit(cfg, versions) {
  if (!cfg.versionCheckUrl) return null;
  const unit = cfg.versionCheckUnit ?? ".";
  if (!versions.has(unit)) {
    throw new Error(`versionCheckUnit desconhecida: unidade '${unit}' não foi encontrada nas fontes SemVer`);
  }
  return unit;
}

function requireVersionCheckUnit(cfg, versions) {
  try {
    return validateVersionCheckUnit(cfg, versions);
  } catch (err) {
    fail(`E_VERSION_SOURCE: ${err.message}`);
  }
}


function validateOptionalString(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} deve ser uma string não vazia ou null`);
  }
  return value;
}

function validateCommand(value, field, { required = false } = {}) {
  const normalized = validateOptionalString(value, field);
  if (normalized === null && required) {
    throw new Error(`${field} é obrigatório quando stopCommand é usado`);
  }
  return normalized;
}

function validateDeployConfig(cfg) {
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) {
    throw new Error("ship.config.json deve conter um objeto JSON");
  }
  validateOptionalString(cfg.dbPath, "dbPath");
  validateOptionalString(cfg.backupDir, "backupDir");
  if (cfg.schemaWatchPaths !== undefined && cfg.schemaWatchPaths !== null && (!Array.isArray(cfg.schemaWatchPaths) || cfg.schemaWatchPaths.some((item) => typeof item !== "string"))) {
    throw new Error("schemaWatchPaths deve ser uma lista de strings");
  }
  const stopCommand = validateCommand(cfg.stopCommand, "stopCommand");
  const startCommand = validateCommand(cfg.startCommand, "startCommand", { required: Boolean(stopCommand) });
  const buildCommand = validateCommand(cfg.buildCommand, "buildCommand");
  const versionCheckUrl = validateCommand(cfg.versionCheckUrl, "versionCheckUrl");
  if (versionCheckUrl) {
    try {
      const parsed = new URL(versionCheckUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocolo");
    } catch {
      throw new Error("versionCheckUrl deve ser uma URL HTTP(S) válida");
    }
  }
  if (cfg.versionCheckUnit !== undefined && (typeof cfg.versionCheckUnit !== "string" || !cfg.versionCheckUnit.trim())) {
    throw new Error("versionCheckUnit deve ser uma unidade não vazia");
  }
  if (cfg.versionCheckTimeoutMs !== undefined && (typeof cfg.versionCheckTimeoutMs !== "number" || !Number.isFinite(cfg.versionCheckTimeoutMs))) {
    throw new Error("versionCheckTimeoutMs deve ser numérico");
  }
  if (cfg.dbPath && !stopCommand) {
    throw new Error("dbPath configurado exige stopCommand para comprovar quiescência");
  }
  return { ...cfg, dbPath: cfg.dbPath ?? null, stopCommand, startCommand, buildCommand, versionCheckUrl };
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
  let description = String(raw ?? "").trim();
  let breaking = /BREAKING\s+CHANGE\s*:/i.test(description);
  const prefixed = description.match(/^(?:fix|feat)(!)?:\s*/i);
  if (prefixed) {
    breaking ||= Boolean(prefixed[1]);
    description = description.slice(prefixed[0].length).trim();
  }
  if (/^!:\s*/.test(description)) {
    breaking = true;
    description = description.replace(/^!:\s*/, "").trim();
  }
  return { description, breaking };
}

function requireReleaseDescription(raw) {
  const normalized = releaseDescription(raw);
  if (!normalized.description) {
    throw new Error("descrição normalizada vazia");
  }
  return normalized;
}

function releaseTitle(type, raw, issue = null) {
  const { description, breaking } = requireReleaseDescription(raw);
  const prefix = `${type}${breaking ? "!" : ""}: `;
  const suffix = issue === null ? "" : ` (#${issue})`;
  const available = Math.max(1, 72 - prefix.length - suffix.length);
  return `${prefix}${description.slice(0, available)}${suffix}`;
}

function mergePrBody(existingBody, payload, issue) {
  const closeMarker = /^\s*Closes\s+#(\d+)\s*$/i;
  const breaking = /^\s*BREAKING\s+CHANGE\s*:/i;
  const existingLines = String(existingBody ?? "").split("\n");
  let hasClose = false;
  let hasBreaking = false;
  let existingCloseSeen = false;
  const canonicalLines = [];
  for (const line of existingLines) {
    const marker = line.match(closeMarker);
    if (marker) {
      if (!existingCloseSeen) {
        canonicalLines.push(`Closes #${issue}`);
        existingCloseSeen = true;
        hasClose = true;
      }
      continue;
    }
    if (breaking.test(line)) {
      if (!hasBreaking) {
        canonicalLines.push(line);
        hasBreaking = true;
      }
      continue;
    }
    canonicalLines.push(line);
  }

  let payloadHasClose = false;
  const payloadBreaking = [];
  const payloadContent = [];
  for (const line of String(payload ?? "").split("\n")) {
    const marker = line.match(closeMarker);
    if (marker) {
      if (marker[1] !== String(issue)) {
        throw new Error(`body contém marcador Closes de outra issue (#${marker[1]})`);
      }
      payloadHasClose = true;
    } else if (breaking.test(line)) {
      if (!hasBreaking && !payloadBreaking.length) payloadBreaking.push(line);
    } else {
      payloadContent.push(line);
    }
  }
  const sanitized = [...payloadBreaking, ...payloadContent].join("\n");
  const markerOnlyPayload = !payloadContent.some((line) => line.trim()) && (payloadHasClose || payloadBreaking.length > 0);
  const payloadHasContent = Boolean(sanitized.trim());
  let body = canonicalLines.join("\n");

  if (!hasClose && payloadHasClose) {
    const separator = markerOnlyPayload ? "\n" : "\n\n";
    body = body.trim() ? `Closes #${issue}${separator}${body}` : `Closes #${issue}`;
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
function defaultBranch(repository = repoSlug()) {
  return gh(["api", `repos/${repository}`, "-q", ".default_branch"]);
}
function redactUrlForMessage(raw) {
  const value = String(raw ?? "").trim();
  try {
    const parsed = new URL(value);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "<URL inválida>";
  }
}
function redactUrlsInMessage(raw) {
  return String(raw ?? "").replace(/https?:\/\/[^\s"'`<>]+/gi, (candidate) => redactUrlForMessage(candidate));
}
function validateResourceUrl(raw, repository, resource) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  const expectedHost = String(process.env.GH_HOST ?? "github.com").trim().toLowerCase();
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.hostname.toLowerCase() !== expectedHost ||
    parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    return null;
  }
  const prefix = `/${repository}/${resource}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  const number = parsed.pathname.slice(prefix.length);
  if (!/^\d+$/.test(number)) return null;
  return { url: value, number };
}
function enableAutoMerge(prUrl) {
  const auto = spawnSync("gh", ["pr", "merge", prUrl, "--auto", "--squash"], { cwd: root, encoding: "utf8" });
  if (auto.status === 0) console.log("Auto-merge habilitado — o PR mergeia quando o CI ficar verde.");
  else console.warn("Auto-merge não habilitado (repo sem allow_auto_merge?) — mergue manualmente após o CI.");
}

function usage() {
  console.log(`Uso:
  ship.mjs setup
  ship.mjs new (--bug <título> | --feat <título>) [--desc <texto>]
  ship.mjs ship <descrição> [--body-file <arquivo>]
  ship.mjs deploy`);
  process.exit(1);
}

// ---------- setup ----------
function normalizeGitignore() {
  const gi = path.join(root, ".gitignore");
  const existed = existsSync(gi);
  const original = existed ? readFileSync(gi, "utf8") : "";
  const lines = original.replace(/\r\n?/g, "\n").split("\n").filter((line, index, all) => !(line === ".omp/" && all.indexOf(line) !== index));
  while (lines.at(-1) === "") lines.pop();
  if (!lines.includes(".omp/")) lines.push(".omp/");
  const normalized = `${lines.join("\n")}\n`;
  if (!existed || normalized !== original) {
    writeFileSync(gi, normalized);
    console.log(".omp/ normalizado no .gitignore");
  }
}

function setup() {
  normalizeGitignore();
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
  console.log("ship.config.json criado — edite com os valores do projeto.");
}

// ---------- new ----------
function cmdNew(argv) {
  const bug = flagValue(argv, "--bug");
  const feat = flagValue(argv, "--feat");
  if (argv.includes("--bug") && argv.includes("--feat")) {
    console.error("--bug e --feat não podem ser usados simultaneamente; escolha exatamente um.");
    process.exit(1);
  }
  const desc = flagValue(argv, "--desc");
  const type = bug ? "fix" : "feat";
  const title = bug || feat;
  try {
    requireReleaseDescription(title);
  } catch (err) {
    console.error(`Título/descrição inválido: ${err.message}`);
    process.exit(1);
  }
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
  const repository = repoSlug();
  const def = defaultBranch(repository);
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
  const issue = validateResourceUrl(url, repository, "issues");
  if (!issue) {
    restoreBranch();
    console.error(`Não consegui validar a URL da issue criada: ${redactUrlForMessage(url)}`);
    process.exit(1);
  }
  const n = issue.number;
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
  let normalized;
  try {
    normalized = requireReleaseDescription(rawDescription);
  } catch (err) {
    fail(`Descrição inválida: ${err.message}`);
  }
  const branch = git(["branch", "--show-current"]);
  const m = branch.match(/^(fix|feat)\/(\d+)-/);
  if (!m) {
    console.error(`Branch atual '${branch}' não segue fix/#N-… ou feat/#N-… — use 'ship.mjs new' primeiro.`);
    process.exit(1);
  }
  const [, type, n] = m;

  let rawPayload = "";
  if (bodyFile) {
    const bodyPath = path.resolve(root, bodyFile);
    if (!existsSync(bodyPath)) {
      console.error(`--body-file: arquivo não encontrado: ${bodyFile}`);
      process.exit(1);
    }
    rawPayload = readFileSync(bodyPath, "utf8");
    try {
      // Validate the payload before any auth, PR lookup, commit, push or PR creation.
      mergePrBody("", rawPayload, n);
    } catch (err) {
      console.error(`--body-file inválido: ${err?.message ?? err}`);
      process.exit(1);
    }
  }

  requireVersionSources();
  requireGhAuth();
  requirePushRemote();
  const repository = repoSlug();
  let def = "";
  let prUrl = "";
  try {
    def = defaultBranch(repository);
    prUrl = gh([
      "pr", "list", "--head", branch, "--base", def, "--state", "open",
      "--json", "url,headRepository",
      "-q", `map(select(.headRepository.nameWithOwner == "${repository}")) | .[0].url`,
    ]);
    if (prUrl === "null") prUrl = "";
  } catch {
    fail("Não consegui determinar a branch default/PR existente; nenhuma alteração foi publicada.");
  }
  if (prUrl && !validateResourceUrl(prUrl, repository, "pull")) {
    fail(`PR existente retornou URL inválida: ${redactUrlForMessage(prUrl)}`);
  }
  if (!prUrl) requireLabel(type);
  // Retry body-only is deliberately independent of the local commit state.
  if (bodyFile && prUrl) {
    const existingBodyJson = gh(["pr", "view", prUrl, "--json", "body"]);
    const existingBody = JSON.parse(existingBodyJson).body ?? "";
    const payloadHasCloseMarker = String(rawPayload).split(/\r?\n/).some((line) => /^\s*Closes\s+#\d+\s*$/i.test(line));
    const mergePayload = payloadHasCloseMarker ? rawPayload : `${rawPayload}\nCloses #${n}`;
    const mergedBody = rawPayload.trim() ? mergePrBody(existingBody, mergePayload, n) : existingBody;
    if (mergedBody !== existingBody) gh(["pr", "edit", prUrl, "--body", mergedBody]);
    enableAutoMerge(prUrl);
    return;
  }


  // Retry body-only is deliberately independent of the local commit state.
  const bodyExtra = rawPayload.trim() ? `\n\n${rawPayload}` : "";

  const commitTitle = releaseTitle(type, rawDescription, n);
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
      "--body", mergePrBody(`Closes #${n}\n\n${normalized.description}`, bodyExtra, n),
    ]);
  }
  const pr = validateResourceUrl(prUrl, repository, "pull");
  if (!pr) {
    fail(`PR create retornou URL vazia ou inválida: ${redactUrlForMessage(prUrl)}`);
  }
  console.log(`PR ${prUrl}`);
  enableAutoMerge(prUrl);
}
let rollbackAlreadyAttempted = false;

function runRollbackCommand(failures, command, failureMessage) {
  try {
    if (!runShell(command)) {
      failures.push(failureMessage);
      return false;
    }
    return true;
  } catch (err) {
    failures.push(`${failureMessage}: ${err?.message ?? err}`);
    return false;
  }
}

function restoreStoppedDeployment(oldHead, oldCfg, activeCfg = oldCfg) {
  if (rollbackAlreadyAttempted) return;
  rollbackAlreadyAttempted = true;
  const failures = [];
  const stopCommands = [...new Set([activeCfg?.stopCommand, oldCfg?.stopCommand].filter((command) => typeof command === "string" && command.trim()))];
  let quiescenceConfirmed = stopCommands.length === 0;
  for (const [index, command] of stopCommands.entries()) {
    const stopLabel = index === 0 ? "stopCommand ativo" : "stopCommand da revisão anterior";
    if (runRollbackCommand(failures, command, `não consegui parar o processo parcialmente iniciado (${stopLabel})`)) {
      quiescenceConfirmed = true;
      break;
    }
  }
  if (activeCfg !== oldCfg && !quiescenceConfirmed) {
    failures.push("não consegui comprovar quiescência; reset/start da revisão anterior foram bloqueados");
    console.error(`rollback do deploy incompleto: ${failures.join("; ")}.`);
    return;
  }
  let resetSucceeded = true;
  try {
    git(["reset", "--hard", oldHead]);
  } catch (err) {
    resetSucceeded = false;
    failures.push(`não consegui restaurar o revision ${oldHead}: ${err?.message ?? err}`);
  }
  if (!resetSucceeded) {
    console.error(`rollback do deploy incompleto: ${failures.join("; ")}.`);
    return;
  }
  if (oldCfg.buildCommand && !runRollbackCommand(failures, oldCfg.buildCommand, "o build da revisão anterior falhou")) {
    console.error(`rollback do deploy incompleto: ${failures.join("; ")}.`);
    return;
  }
  if (oldCfg.startCommand) {
    runRollbackCommand(failures, oldCfg.startCommand, "o startCommand da revisão anterior falhou");
  } else {
    failures.push("startCommand da revisão anterior não está configurado");
  }
  if (failures.length) {
    console.error(`rollback do deploy incompleto: ${failures.join("; ")}.`);
  } else {
    console.error(`rollback do deploy concluído: revisão ${oldHead} restaurada e servidor reiniciado.`);
  }
}

function failAfterStoppedDeploy(stopped, _oldHead, _oldCfg, message) {
  const error = new Error(message);
  error.rollbackRequired = Boolean(stopped);
  throw error;
}

async function checkServedVersion(cfg, expectedVersion) {
  let lastError = new Error("versão servida ausente, inválida ou divergente");
  const timeoutValue = cfg.versionCheckTimeoutMs;
  const timeoutMs = typeof timeoutValue === "number" && Number.isFinite(timeoutValue) && timeoutValue > 0
    ? Math.min(timeoutValue, 2_147_483_647)
    : 10_000;
  const maxAttempts = 20;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(cfg.versionCheckUrl, { signal: controller.signal });
      const status = response?.status;
      if (!response || typeof status !== "number" || status < 200 || status >= 300) {
        await response?.body?.cancel?.();
        throw new Error(`HTTP ${status ?? "desconhecido"} não é 2xx`);
      }
      const served = extractServedVersion(await response.text());
      if (!served) throw new Error("versão servida ausente ou não é SemVer estrito");
      if (served !== expectedVersion) {
        throw new Error(`versão servida v${served} ≠ unidade resolvida v${expectedVersion}`);
      }
      console.log(`Versão servida confere: v${served}`);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxAttempts - 1) await new Promise((resolve) => setTimeout(resolve, 100));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Não consegui validar ${redactUrlForMessage(cfg.versionCheckUrl)} após ${maxAttempts} tentativas: ${redactUrlsInMessage(lastError.message)}`);
}

// ---------- deploy ----------
async function deploy() {
  rollbackAlreadyAttempted = false;
  if (!existsSync(CONFIG)) {
    console.error("ship.config.json ausente — rode 'ship.mjs setup' e preencha.");
    process.exit(1);
  }
  let cfg;
  try {
    cfg = validateDeployConfig(readConfig());
  } catch (err) {
    console.error(`ship.config.json inválido: ${err?.message ?? err}`);
    process.exit(1);
  }
  const versionsBeforeEffects = requireVersionSources();
  requireVersionCheckUnit(cfg, versionsBeforeEffects);
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
  const startCommand = cfg.startCommand;
  if (cfg.stopCommand && (typeof startCommand !== "string" || !startCommand.trim())) {
    console.error("Deploy cancelado: startCommand inválido antes de executar stopCommand.");
    process.exit(1);
  }
  let stopped = false;
  if (cfg.stopCommand) {
    // A stop can partially terminate the service before returning non-zero or
    // throwing. Mark the boundary before invoking it so every failure is
    // fail-closed and attempts to restore the old revision.
    stopped = true;
    try {
      const stopResult = spawnSync(cfg.stopCommand, { shell: true, cwd: root, stdio: "inherit" });
      if (stopResult?.status !== 0) {
        restoreStoppedDeployment(oldHead, oldCfg, cfg);
        console.error(`Deploy cancelado: stopCommand falhou; operação fail-closed para não continuar em estado inseguro${cfg.dbPath ? " antes do snapshot" : ""}.`);
        process.exit(1);
      }
    } catch (err) {
      restoreStoppedDeployment(oldHead, oldCfg, cfg);
      console.error(`Deploy cancelado: stopCommand lançou exceção; operação fail-closed (${err?.message ?? err}).`);
      process.exit(1);
    }
  }
  if (!cfg.stopCommand) stopped = false;

  try {
    let backupDest;
    try {
      backupDest = performBackup(cfg, root);
    } catch (err) {
      failAfterStoppedDeploy(stopped, oldHead, oldCfg, `Backup falhou: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (backupDest === false) {
      failAfterStoppedDeploy(stopped, oldHead, oldCfg, "Backup não produziu um snapshot verificável.");
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
      cfg = validateDeployConfig(readConfig());
    } catch (err) {
      failAfterStoppedDeploy(stopped, oldHead, oldCfg, `ship.config.json ficou inválido após o pull: ${err?.message ?? err}`);
    }
    try {
      const versionsAfterPull = validateVersionSources();
      validateVersionCheckUnit(cfg, versionsAfterPull);
    } catch (err) {
      failAfterStoppedDeploy(
        stopped,
        oldHead,
        oldCfg,
        `E_VERSION_SOURCE: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    const postPullConfigChanged =
      cfg.stopCommand !== oldCfg.stopCommand ||
      cfg.startCommand !== oldCfg.startCommand ||
      cfg.dbPath !== prePullDbPath ||
      backupDirFor(cfg) !== prePullBackupDir;
    const postPullQuiescenceChanged =
      cfg.stopCommand !== oldCfg.stopCommand ||
      cfg.dbPath !== prePullDbPath ||
      backupDirFor(cfg) !== prePullBackupDir;
    if (stopped && !cfg.startCommand) {
      failAfterStoppedDeploy(
        stopped,
        oldHead,
        oldCfg,
        "Deploy cancelado: o serviço foi parado, mas a configuração pós-pull não tem startCommand.",
      );
    }
    if (postPullConfigChanged && postPullQuiescenceChanged) {
      // A changed stop or snapshot boundary must be re-established with the
      // post-pull command. Mark stopped first: a partial stop is unsafe.
      if (cfg.stopCommand) {
        stopped = true;
        let postPullStop;
        try {
          postPullStop = spawnSync(cfg.stopCommand, { shell: true, cwd: root, stdio: "inherit" });
        } catch (err) {
          failAfterStoppedDeploy(stopped, oldHead, oldCfg, `stopCommand pós-pull lançou exceção: ${err?.message ?? err}`);
        }
        if (postPullStop?.status !== 0) {
          failAfterStoppedDeploy(stopped, oldHead, oldCfg, "stopCommand pós-pull falhou ao comprovar quiescência.");
        }
      }
      if (cfg.dbPath !== prePullDbPath || backupDirFor(cfg) !== prePullBackupDir) {
        let postPullBackup;
        try {
          postPullBackup = performBackup(cfg, root);
        } catch (err) {
          failAfterStoppedDeploy(stopped, oldHead, oldCfg, `Backup pós-pull falhou: ${err instanceof Error ? err.message : String(err)}`);
        }
        if (postPullBackup === false) failAfterStoppedDeploy(stopped, oldHead, oldCfg, "Backup pós-pull não produziu um snapshot verificável.");
        if (postPullBackup) console.log(`Backup pós-pull: ${postPullBackup}`);
        else if (cfg.dbPath) console.warn(`Backup pulado: '${cfg.dbPath}' no manifesto não existe no repo.`);
      }
    }

    // const changed = computed inside this rollback boundary
    let changed;
    try {
      changed = git(["diff", "--name-only", oldHead, "HEAD"])
        .split("\n")
        .map((file) => file.replace(/\r$/, "").replaceAll("\\", "/"))
        .filter(Boolean);
    } catch (err) {
      failAfterStoppedDeploy(stopped, oldHead, oldCfg, `Leitura do diff falhou: ${err?.message ?? err}`);
    }
    const watch = resolveSchemaWatch(cfg.schemaWatchPaths);
    const hits = watch.filter((watched) => {
      const absolute = path.resolve(root, watched);
      const relative = path.relative(root, absolute).replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
      return changed.some((file) => !relative || file === relative || file.startsWith(`${relative}/`));
    });
    if (hits.length) {
      console.warn(`ATENÇÃO: possível migração de schema neste pull: ${hits.join(", ")} (forward-only).`);
    }

    if (cfg.buildCommand) {
      if (!runShell(cfg.buildCommand)) throw new Error("Build falhou — a revisão nova não foi iniciada.");
    } else {
      console.log("build: NA (reason: Nenhum build configurado; evidence: ship.config.json: buildCommand=null)");
    }
    if (cfg.startCommand && !runShell(cfg.startCommand)) {
      throw new Error("Start falhou — veja a saída acima / o log do seu startCommand.");
    }
    if (cfg.versionCheckUrl) {
      const versions = validateVersionSources();
      const unit = validateVersionCheckUnit(cfg, versions);
      const expectedVersion = versions.get(unit);
      await checkServedVersion(cfg, expectedVersion);
    }
  } catch (err) {
    if (stopped) restoreStoppedDeployment(oldHead, oldCfg, cfg);
    console.error(`Deploy falhou: ${err?.message ?? err}`);
    process.exit(1);
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
    console.error(`ship.mjs: ${redactUrlsInMessage(err?.message ?? err)}`);
  }
  process.exit(1);
}
