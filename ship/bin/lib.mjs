// Runtime suportado: Node.js >=20.
// Funções puras do motor ship.mjs — sem efeitos colaterais, testáveis isoladamente.
// ship.mjs importa daqui; os testes em ship/bin/lib.test.mjs cobrem os contratos.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { closeSync, constants, fstatSync, lstatSync, linkSync, mkdirSync, openSync, readFileSync, readSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateQualityReportFile } from "../../tdd-orchestrator/lib/quality.mjs";
const DEFAULT_SCHEMA_WATCH_PATH = "src/lib/db.ts";

// The legacy CLI remains identifiable; new policy runs require a real report.
export function validateShipQuality(root, { reportPath, required = false, contextPath } = {}) {
  try {
    if (typeof required !== "boolean") throw Error("quality required must be boolean");
    if (reportPath === undefined) {
      reportPath = ".omp/state/quality.json";
      // lstat preserves dangling-link presence; only genuine absence is legacy.
      try { lstatSync(path.resolve(root, reportPath)); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        if (required || contextPath !== undefined) throw Error("quality report required");
        return { ok: true, errors: [], report: null, legacy: true };
      }
    }
    return { ...validateQualityReportFile(root, reportPath, contextPath), legacy: false };
  } catch (error) {
    return { ok: false, errors: [error.message], report: null, legacy: false };
  }
}

const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![\s\S])/;

export function isValidSemVer(value) {
  return typeof value === "string" && SEMVER_RE.test(value);
}

export function slugify(title) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
}

export function flagValue(argv, name) {
  const i = argv.indexOf(name);
  const value = i === -1 ? null : argv[i + 1];
  return typeof value === "string" && value.length > 0 && !value.startsWith("--") ? value : null;
}

// Extrai o número da issue/PR do fim da URL retornada pelo gh (defensivo:
// só retorna se numérico; o chamador decide o erro). Retorna string ou null.
export function extractIssueNumber(url) {
  const tail = (url ?? "").trim().split("/").pop() ?? "";
  const n = tail.replace(/[?#].*$/, "");
  return /^\d+$/.test(n) ? n : null;
}

// Parse da versão servida a partir do HTML: remove comentários, procura
// v(X.Y.Z[-prerelease][+build]) a partir do texto âncora "Versão da aplicação"
// (se presente) senão a primeira ocorrência. Retorna a versão ou null.
export function extractServedVersion(html) {
  let text = String(html ?? "").replace(/<!--[\s\S]*?-->/g, "");
  const anchor = text.indexOf("Versão da aplicação");
  if (anchor !== -1) text = text.slice(anchor);
  const match = text.match(/(?<![\p{L}\p{N}_-])v(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)(?=$|[^\p{L}\p{N}_+.-]|\.(?=$|[^\p{L}\p{N}_+.-]))/u);
  const candidate = match?.[1] ?? null;
  return candidate && isValidSemVer(candidate) ? candidate : null;
}


// Resolve a lista de schema watch do manifesto. Campo omitido (undefined/null)
// → default legado ["src/lib/db.ts"] (manifestos antigos não perdem o aviso);
// lista explícita → usa-a (inclusive [] para desligar o aviso).
export function resolveSchemaWatch(value) {
  if (value === undefined || value === null) return [DEFAULT_SCHEMA_WATCH_PATH];
  if (Array.isArray(value)) return value.filter((p) => typeof p === "string");
  return [DEFAULT_SCHEMA_WATCH_PATH];
}

// Etapa de backup do deploy. A consistência do banco vivo continua dependendo de
// quiescência/WAL do deployer; aqui só há proteção causal dos bytes publicados.
const WINDOWS_EXLOCK = 0x10000000;
const WINDOWS_CRT_TEMPORARY = 0x40;
const LINUX_HELPER_PATH = fileURLToPath(new URL("./backup-linux.py", import.meta.url));
const LINUX_PROTOCOL_ID = "linux-fd-backup-v1";

function backupError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function isRegularStats(stats) {
  return stats.isFile() && !stats.isSymbolicLink();
}

function sameIdentity(left, right) {
  return (
    typeof left.dev === "bigint" &&
    typeof left.ino === "bigint" &&
    typeof right.dev === "bigint" &&
    typeof right.ino === "bigint" &&
    left.dev === right.dev &&
    left.ino === right.ino
  );
}

function sameContentState(left, right) {
  return left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function readSourceStat(src) {
  try {
    const stats = lstatSync(src, { bigint: true });
    if (!isRegularStats(stats)) throw backupError("E_BACKUP_UNSAFE", `Backup source must be a regular file: ${src}`);
    return stats;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function verifySourcePath(src, expected, phase) {
  const stats = lstatSync(src, { bigint: true });
  if (!isRegularStats(stats) || !sameIdentity(expected, stats)) {
    throw backupError("E_BACKUP_UNSAFE", `Backup source changed ${phase}: ${src}`);
  }
  return stats;
}

function verifySourceFd(src, expected, fdStats, phase) {
  if (!isRegularStats(fdStats) || !sameIdentity(expected, fdStats)) {
    throw backupError("E_BACKUP_UNSAFE", `Backup source handle changed ${phase}: ${src}`);
  }
}

function copyPinnedFd(sourceFd, destinationFd) {
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let bytesRead;
  do {
    bytesRead = readSync(sourceFd, buffer, 0, buffer.length, null);
    let written = 0;
    while (written < bytesRead) {
      written += writeSync(destinationFd, buffer, written, bytesRead - written, null);
    }
  } while (bytesRead > 0);
}

function backupBase(src, dir) {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return path.join(dir, `${path.basename(src)}-${timestamp}`);
}

function closeFdOnce(fd, label) {
  if (fd === null) return null;
  try {
    closeSync(fd);
    return null;
  } catch (error) {
    return backupError("E_BACKUP_CLOSE", `${label} failed`, error);
  }
}

function mergeFailure(primary, closeFailure) {
  if (!closeFailure) return primary;
  if (!primary) return closeFailure;
  closeFailure.cause = primary;
  return closeFailure;
}

function windowsTempFlags() {
  const required = [constants.O_CREAT, constants.O_EXCL, constants.O_RDWR, constants.O_RDONLY];
  if (!required.every((value) => Number.isInteger(value))) {
    throw backupError("E_BACKUP_UNSUPPORTED", "Windows backup flags are unavailable");
  }
  return constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | WINDOWS_EXLOCK | WINDOWS_CRT_TEMPORARY;
}

function performWindowsBackup(src, sourceStat, dir) {
  const tempFlags = windowsTempFlags();
  const sourceFlags = constants.O_RDONLY;
  const base = backupBase(src, dir);
  for (let attempt = 0; ; attempt += 1) {
    const dest = attempt === 0 ? base : `${base}-${attempt}`;
    const temp = `${dest}.tmp-${process.pid}`;
    let tempFd = null;
    let sourceFd = null;
    try {
      tempFd = openSync(temp, tempFlags, 0o600);
      const tempStat = fstatSync(tempFd, { bigint: true });
      if (!isRegularStats(tempStat)) throw backupError("E_BACKUP_UNSAFE", `Backup staging must be a regular file: ${temp}`);
      sourceFd = openSync(src, sourceFlags);
      verifySourcePath(src, sourceStat, "before opening");
      const openedFd = fstatSync(sourceFd, { bigint: true });
      verifySourceFd(src, sourceStat, openedFd, "before copying");
      copyPinnedFd(sourceFd, tempFd);
      const finalFd = fstatSync(sourceFd, { bigint: true });
      const finalPath = verifySourcePath(src, sourceStat, "while copying");
      if (!sameContentState(openedFd, finalFd) || !sameIdentity(finalPath, finalFd)) {
        throw backupError("E_BACKUP_UNSAFE", `Backup source changed while copying: ${src}`);
      }
      linkSync(temp, dest);
      const publishedSourceFd = sourceFd;
      sourceFd = null;
      const publishedTempFd = tempFd;
      tempFd = null;
      let closeFailure = closeFdOnce(publishedTempFd, `Windows staging close after publishing ${dest}`);
      closeFailure = mergeFailure(closeFailure, closeFdOnce(publishedSourceFd, `Windows source close after publishing ${dest}`));
      if (closeFailure) throw closeFailure;
      return dest;
    } catch (error) {
      const pendingSourceFd = sourceFd;
      sourceFd = null;
      const pendingTempFd = tempFd;
      tempFd = null;
      let closeFailure = closeFdOnce(pendingSourceFd, `Windows source close before retry of ${dest}`);
      closeFailure = mergeFailure(closeFailure, closeFdOnce(pendingTempFd, `Windows staging close before retry of ${dest}`));
      const finalError = mergeFailure(error, closeFailure);
      if (finalError?.code === "EEXIST") continue;
      throw finalError;
    }
  }
}

function parseLinuxProtocol(result, nonce, target) {
  if (result?.error) {
    throw backupError("E_BACKUP_UNSUPPORTED", `Linux backup helper unavailable: ${result.error.message}`, result.error);
  }
  if (typeof result.stdout !== "string" || !result.stdout.endsWith("\n")) {
    throw backupError("E_BACKUP_PROTOCOL", "Linux backup helper returned no terminal handshake");
  }
  const body = result.stdout.slice(0, -1);
  if (!body || body.includes("\n")) throw backupError("E_BACKUP_PROTOCOL", "Linux backup helper returned malformed output");
  let message;
  try {
    message = JSON.parse(body);
  } catch (error) {
    throw backupError("E_BACKUP_PROTOCOL", "Linux backup helper returned invalid JSON", error);
  }
  const baseKeys = Object.keys(message).sort().join(",");
  const errorKeys = "count,error,id,nonce,status,target";
  const successKeys = "count,id,nonce,status,target";
  if (result?.status !== 0) {
    if (baseKeys !== errorKeys || message.nonce !== nonce || message.count !== 1 || message.id !== LINUX_PROTOCOL_ID || message.target !== target || message.status !== "error") {
      throw backupError("E_BACKUP_NATIVE", "Linux backup helper failed closed");
    }
    throw backupError("E_BACKUP_NATIVE", `Linux backup helper failed for ${target}: ${message.error}`);
  }
  if (baseKeys !== successKeys) {
    throw backupError("E_BACKUP_PROTOCOL", "Linux backup helper returned an unexpected envelope");
  }
  if (
    message.nonce !== nonce ||
    message.count !== 1 ||
    message.id !== LINUX_PROTOCOL_ID ||
    message.target !== target ||
    !["collision", "published"].includes(message.status)
  ) {
    throw backupError("E_BACKUP_PROTOCOL", "Linux backup helper handshake did not match the request");
  }
  return message.status;
}

function performLinuxBackup(src, sourceStat, dir, root) {
  if (!Number.isInteger(constants.O_DIRECTORY)) {
    throw backupError("E_BACKUP_UNSUPPORTED", "Linux backup directory capability is unavailable");
  }
  let dirFd = null;
  let operationFailure = null;
  let resultDest = null;
  try {
    dirFd = openSync(dir, constants.O_RDONLY | constants.O_DIRECTORY);
    const base = backupBase(src, dir);
    for (let attempt = 0; ; attempt += 1) {
      const dest = attempt === 0 ? base : `${base}-${attempt}`;
      const target = path.basename(dest);
      let sourceFd = null;
      let status = null;
      let attemptFailure = null;
      try {
        sourceFd = openSync(src, constants.O_RDONLY);
        verifySourcePath(src, sourceStat, "before opening");
        const openedFd = fstatSync(sourceFd, { bigint: true });
        verifySourceFd(src, sourceStat, openedFd, "before copying");
        const nonce = randomUUID();
        const result = spawnSync(
          "/usr/bin/python3",
          [
            "-I",
            "-S",
            LINUX_HELPER_PATH,
            nonce,
            target,
            src,
            String(sourceStat.dev),
            String(sourceStat.ino),
            String(sourceStat.size),
            String(sourceStat.mtimeNs),
            String(sourceStat.ctimeNs),
          ],
          {
            cwd: "/",
            env: { LANG: "C", LC_ALL: "C" },
            encoding: "utf8",
            maxBuffer: 64 * 1024,
            stdio: ["ignore", "pipe", "pipe", sourceFd, dirFd],
          },
        );
        status = parseLinuxProtocol(result, nonce, target);
        if (status !== "collision") {
          const finalFd = fstatSync(sourceFd, { bigint: true });
          const finalPath = verifySourcePath(src, sourceStat, "after publication");
          if (!sameContentState(openedFd, finalFd) || !sameIdentity(finalPath, finalFd)) {
            throw backupError("E_BACKUP_UNSAFE", `Backup source changed after copying: ${src}`);
          }
          resultDest = dest;
        }
      } catch (error) {
        attemptFailure = error;
      }
      const ownedSourceFd = sourceFd;
      sourceFd = null;
      attemptFailure = mergeFailure(
        attemptFailure,
        closeFdOnce(
          ownedSourceFd,
          status === "published" ? `Linux source close after publishing ${dest}` : `Linux source close for ${dest}`,
        ),
      );
      if (attemptFailure) {
        operationFailure = attemptFailure;
        break;
      }
      if (status === "collision") continue;
      break;
    }
  } catch (error) {
    operationFailure = mergeFailure(operationFailure, error);
  }
  const ownedDirFd = dirFd;
  dirFd = null;
  operationFailure = mergeFailure(operationFailure, closeFdOnce(ownedDirFd, "Linux backup directory close"));
  if (operationFailure) throw operationFailure;
  return resultDest;
}

export function performBackup(cfg, root) {
  if (!cfg.dbPath) return null;
  const src = path.resolve(root, cfg.dbPath);
  const sourceStat = readSourceStat(src);
  if (sourceStat === null) return null;
  if (process.platform !== "win32" && process.platform !== "linux") {
    throw backupError("E_BACKUP_UNSUPPORTED", `Backup publication is unsupported on ${process.platform}`);
  }
  const dir = path.resolve(root, cfg.backupDir ?? path.join(path.dirname(cfg.dbPath), "backup"));
  mkdirSync(dir, { recursive: true });
  if (process.platform === "win32") return performWindowsBackup(src, sourceStat, dir);
  return performLinuxBackup(src, sourceStat, dir, root);
}
