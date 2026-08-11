// Guardrail local: impede push direto na branch padrão — mudanças entram via PR.
// O git passa as refs pela stdin: uma linha por ref no formato
// "<local ref> <local sha> <remote ref> <remote sha>".
// Bypass explícito: git push --no-verify.
import { spawnSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";

const GIT_VALUE_MISSING_STATUS = 1;

function lstatSafe(file) {
  try {
    return lstatSync(file);
  } catch {
    return null;
  }
}

function regularUnlinked(stat) {
  return Boolean(stat?.isFile() && !stat.isSymbolicLink() && stat.nlink === 1);
}

function gitExecutable() {
  const pathKey = Object.keys(process.env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const candidates = process.platform === "win32" ? ["git.exe", "git.cmd", "git.bat", "git"] : ["git"];
  for (const directory of (process.env[pathKey] ?? "").split(path.delimiter)) {
    if (!directory) continue;
    for (const candidate of candidates) {
      const executable = path.join(directory, candidate);
      if (regularUnlinked(lstatSafe(executable))) return executable;
    }
  }
  return null;
}

function runGit(args) {
  const executable = gitExecutable();
  if (!executable) {
    return {
      error: Object.assign(
        new Error("E_UNSAFE_GIT_EXECUTABLE: nenhum executável Git regular e não vinculado foi encontrado no PATH"),
        { code: "E_UNSAFE_GIT_EXECUTABLE" },
      ),
    };
  }
  const result = spawnSync(executable, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) {
    return { error: result.error };
  }
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function gitFailure(result, operation) {
  const detail = result.error?.message || result.stderr.trim() || `status ${result.status}`;
  console.error(`[pre-push] Não foi possível ${operation}: ${detail}`);
  process.exit(1);
}

function invalidDefaultBranch() {
  console.error("[pre-push] A branch padrão configurada é inválida; push bloqueado por segurança.");
  process.exit(1);
}

function validateDefaultBranch(value) {
  if (!value || value.startsWith("refs/")) invalidDefaultBranch();

  const check = runGit(["check-ref-format", `refs/heads/${value}`]);
  if (check.error) gitFailure(check, "validar a branch padrão");
  if (check.status !== 0) invalidDefaultBranch();
}

function validateRemoteName(value) {
  if (
    !value ||
    value.startsWith("-") ||
    value.includes("..") ||
    value.includes("@{") ||
    /[\s~^:?*[\]\\]/.test(value)
  ) {
    console.error("[pre-push] O nome do remote é inválido; push bloqueado por segurança.");
    process.exit(1);
  }
  return value;
}

function remoteRefExists(remoteHeadRef) {
  const result = runGit(["for-each-ref", "--format=%(refname)", remoteHeadRef]);
  if (result.error) gitFailure(result, "resolver a branch padrão");
  if (result.status !== 0) gitFailure(result, "resolver a branch padrão");
  return result.stdout.split(/\r?\n/).some((ref) => ref === remoteHeadRef);
}

function readRemoteDefaultBranch(remoteName) {
  const remotePrefix = `${remoteName}/`;
  const remoteHeadRef = `refs/remotes/${remoteName}/HEAD`;
  const remoteHead = runGit(["symbolic-ref", "--quiet", "--short", remoteHeadRef]);
  if (remoteHead.error) gitFailure(remoteHead, "resolver a branch padrão");
  if (remoteHead.status !== 0 && remoteHead.status !== GIT_VALUE_MISSING_STATUS) {
    gitFailure(remoteHead, "resolver a branch padrão");
  }
  if (remoteHead.status === GIT_VALUE_MISSING_STATUS) {
    if (remoteRefExists(remoteHeadRef)) {
      console.error("[pre-push] A referência HEAD do remote não é simbólica; push bloqueado por segurança.");
      process.exit(1);
    }
    return null;
  }

  const value = remoteHead.stdout.trim();
  if (!value.startsWith(remotePrefix) || value.length <= remotePrefix.length) {
    console.error("[pre-push] A referência HEAD do remote é inválida; push bloqueado por segurança.");
    process.exit(1);
  }

  const branch = value.slice(remotePrefix.length);
  validateDefaultBranch(branch);
  return branch;
}

function readConfiguredDefaultBranch() {
  // Limitar a consulta ao config local evita que uma preferência global de
  // outro repositório altere a proteção deste repositório.
  const configured = runGit(["config", "--local", "--get", "init.defaultBranch"]);
  if (configured.error) gitFailure(configured, "ler a branch padrão configurada");
  if (configured.status === 0) {
    const value = configured.stdout.trim();
    validateDefaultBranch(value);
    return value;
  }
  if (configured.status !== GIT_VALUE_MISSING_STATUS) {
    gitFailure(configured, "ler a branch padrão configurada");
  }
  return null;
}

function resolveDefaultBranch(remoteName) {
  const repository = runGit(["rev-parse", "--git-dir"]);
  if (repository.error) gitFailure(repository, "consultar o repositório Git");
  if (repository.status !== 0) {
    const detail = repository.stderr.trim();
    if (/not a git repository|outside a git work tree|não é um repositório git|nao e um repositorio git|no es un repositorio git|pas un dépôt git|pas un depot git|kein git[- ]repository|non è un repository git|non e un repositorio git|geen git-opslagplaats/i.test(detail)) {
      console.error("[pre-push] Nenhum repositório Git encontrado; push bloqueado por segurança.");
      process.exit(1);
    }
    gitFailure(repository, "consultar o repositório Git");
  }
  if (!repository.stdout.trim()) {
    gitFailure(repository, "consultar o repositório Git");
  }

  const remoteBranch = readRemoteDefaultBranch(validateRemoteName(remoteName));
  const configuredBranch = readConfiguredDefaultBranch();
  if (remoteBranch !== null && configuredBranch !== null && remoteBranch !== configuredBranch) {
    console.error(
      `[pre-push] A branch padrão do remote (${remoteBranch}) diverge da configuração local (${configuredBranch}); push bloqueado por segurança.`,
    );
    process.exit(1);
  }
  if (remoteBranch === null && configuredBranch === null) {
    console.error("[pre-push] Não foi possível resolver a branch padrão; push bloqueado por segurança.");
    process.exit(1);
  }

  return remoteBranch ?? configuredBranch;
}

function malformedPushInput() {
  console.error("[pre-push] Não foi possível interpretar as refs recebidas; push bloqueado por segurança.");
  process.exit(1);
}
function validObjectId(value) {
  return /^[0-9a-f]{7,64}$/i.test(value);
}

function validPushRef(value, { allowDelete = false } = {}) {
  if (value === "HEAD") return true;
  if (allowDelete && value === "(delete)") return true;
  if (!value.startsWith("refs/")) return false;
  const check = runGit(["check-ref-format", value]);
  if (check.error || check.status !== 0) return false;
  return true;
}

function validatePushFields(fields) {
  const [localRef, localSha, remoteRef, remoteSha] = fields;
  if (
    !validPushRef(localRef, { allowDelete: true })
    || !validObjectId(localSha)
    || !validPushRef(remoteRef)
    || !validObjectId(remoteSha)
  ) {
    malformedPushInput();
  }
}

function validatePushLine(line, defaultRef, defaultBranch) {
  const trimmed = line.trim();
  if (!trimmed) malformedPushInput();

  // Cada linha recebida pelo hook tem exatamente quatro campos:
  // local-ref, local-sha, remote-ref e remote-sha.
  const fields = trimmed.split(/\s+/);
  if (fields.length !== 4) malformedPushInput();
  validatePushFields(fields);
  const [localRef, , remoteRef] = fields;
  if (localRef === defaultRef || remoteRef === defaultRef) {
    console.error(`\n[pre-push] Push direto na '${defaultBranch}' está bloqueado.`);
    console.error("[pre-push] Crie uma branch, abra um PR e faça o merge via GitHub.\n");
    process.exit(1);
  }
}



let input = "";
try {
  input = readFileSync(0, "utf8");
} catch (err) {
  console.error(`[pre-push] Não foi possível ler as refs recebidas pela entrada padrão: ${err?.message ?? err}`);
  process.exit(1);
}

if (input.length === 0) process.exit(0);

const remoteName = process.argv[2] || "origin";
const defaultBranch = resolveDefaultBranch(remoteName);
const defaultRef = `refs/heads/${defaultBranch}`;

const lines = input.split(/\r?\n/);
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (index === lines.length - 1 && line === "" && input.endsWith("\n")) continue;
  validatePushLine(line, defaultRef, defaultBranch);
}
process.exit(0);
