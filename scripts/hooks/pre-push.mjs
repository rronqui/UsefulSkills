// Guardrail local: impede push direto na branch padrão — mudanças entram via PR.
// O git passa as refs pela stdin: uma linha por ref no formato
// "<local ref> <local sha> <remote ref> <remote sha>".
// Bypass explícito: git push --no-verify.
import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import { readFileSync } from "node:fs";
import path from "node:path";
// BEGIN GENERATED GIT TRUST (do not edit)
const __gitTrustFailure = (message) => { const error = new Error(message); error.code = 'E_UNSAFE_GIT_EXECUTABLE'; return error; };
const failure = __gitTrustFailure;
const __windowsHostPath = function windowsPowerShellPath() {
  const report = typeof process.report?.getReport === "function" ? process.report.getReport() : null;
  const modules = Array.isArray(report?.sharedObjects) ? report.sharedObjects : [];
  const required = ["ntdll.dll", "kernel32.dll", "kernelbase.dll"];
  const roots = new Map();
  for (const name of required) {
    const item = modules.find(value => path.win32.basename(String(value)).toLowerCase() === name);
    if (!item) throw failure(`Windows TCB ausente: ${name}`);
    const normalized = path.win32.normalize(String(item));
    const match = normalized.match(/^(.*?)[\\\/]System32[\\\/][^\\\/]+$/i);
    if (!match) throw failure(`Windows TCB fora de System32: ${item}`);
    const root = path.win32.normalize(match[1]);
    roots.set(root.toLowerCase(), root);
  }
  if (roots.size !== 1) throw failure("Windows TCB com raízes divergentes");
  const root = [...roots.values()][0];
  const executable = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const stat = fs.lstatSync(executable, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync.native(executable).toLowerCase() !== executable.toLowerCase()) throw failure("Windows PowerShell TCB inválido");
  return { executable, root };
};
const __createGitSession = function createGitSession(dependencies = {}) {
  const {
    fs,
    path,
    crypto,
    os,
    spawnSync,
    platform = process.platform,
    env = process.env,
    windowsHostPath,
    queryWindowsMetadata: injectedQuery,
  } = dependencies;

  if (!fs || !path || !crypto || !os || typeof spawnSync !== "function") {
    throw new TypeError("git trust dependencies are incomplete");
  }

  const OFFICIAL = Object.freeze({
    productVersion: "2.54.0.windows.1",
    architecture: "x64",
    wrapperSha256: "81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5",
    gitSha256: "cab4c4eea1d869cf9f7be73868dc9a90ad2df1b1b673e5f8c8714a576c25ea96",
    signer: "Johannes Schindelin",
    certificateFingerprint: "3E:B1:4A:3A:EF:84:B7:15:3E:13:93:97:F0:A4:9E:2F:AC:66:2B:0E",
  });
  const DLL_HASHES = Object.freeze({
    "mingw64/bin/libiconv-2.dll": "7a282a854e01be726c6cccfe46f548c716aa45b3014818468253aaa4efbcd067",
    "mingw64/bin/libintl-8.dll": "0537c3dd2378218508ebe3cc416d72a99ee2d24ae1c5525e23458f32544ef861",
    "mingw64/bin/libpcre2-8-0.dll": "c135a87ed0f11eae8ffc4cb469671ff0b3f5d71fab5fb024e9b1e7241ca25b52",
    "mingw64/bin/libwinpthread-1.dll": "851f61482ad5b6aac7c6abc54bbe31d24f89e0ca683a75fcec2d47f86b2d2242",
    "mingw64/bin/zlib1.dll": "93e9243a44c29200eeacaf9658efe2558581770e4b11ca4b500e18e424a6e3b5",
  });
  const LINK_SET = Object.freeze({
    wrapper: ["cmd/git.exe", "cmd/git-lfs.exe"],
    git: [
      "mingw64/bin/git.exe",
      "mingw64/bin/git-upload-pack.exe",
      "mingw64/bin/git-receive-pack.exe",
      "mingw64/bin/git-upload-archive.exe",
    ],
  });
  const DLL_ALIASES = Object.freeze(Object.fromEntries(Object.keys(DLL_HASHES).map((relative) => [
    relative,
    [relative, relative.replace("mingw64/bin/", "mingw64/libexec/git-core/")],
  ])));
  const KNOWN_DLLS = Object.freeze([
    "advapi32.dll", "bcrypt.dll", "kernel32.dll", "kernelbase.dll", "ntdll.dll", "psapi.dll", "shell32.dll",
  ]);
  const ALLOWED_TUPLES = Object.freeze([
    ["config", "--local", "--null", "--get-all", "core.hooksPath"],
    ["rev-parse", "--git-path", "hooks"],
    ["rev-parse", "--git-common-dir"],
    ["rev-parse", "--git-dir"],
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"],
    ["for-each-ref", "--format=%(refname)", "refs/remotes/origin/HEAD"],
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/upstream/HEAD"],
    ["for-each-ref", "--format=%(refname)", "refs/remotes/upstream/HEAD"],
    ["config", "--local", "--get", "init.defaultBranch"],
    ["check-ref-format", "refs/heads/main"],
  ]);

  let closed = false;
  let terminalFailure = null;
  let firstCwd;
  let firstEnv;
  let approvedExecutable;
  let admitted = false;

  const cloneEnv = (value) => Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key, String(item)]));
  const sameJson = (left, right) => {
    try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
  };
  const fail = (reason, detail) => {
    const error = new Error(`E_UNSAFE_GIT_EXECUTABLE: ${detail}`);
    error.code = "E_UNSAFE_GIT_EXECUTABLE";
    error.reason = reason;
    terminalFailure = error;
    return { status: null, error };
  };
  const failureResult = () => ({ status: null, error: terminalFailure ?? Object.assign(
    new Error("E_UNSAFE_GIT_EXECUTABLE: sessão encerrada"),
    { code: "E_UNSAFE_GIT_EXECUTABLE", reason: "CONTEXT_CHANGED" },
  ) });
  const lstat = (file) => {
    try { return fs.lstatSync(file); } catch { return null; }
  };
  const regular = (stat) => Boolean(stat?.isFile?.() && !stat.isSymbolicLink?.());
  const nlinkNumber = (value) => {
    if (typeof value === "bigint") return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : null;
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const isWindows = platform === "win32";
  const candidates = isWindows ? ["git.exe", "git.cmd", "git.bat", "git"] : ["git"];
  const expectedRoot = "C:\\Program Files\\Git";
  const canonical = (value) => isWindows ? path.win32.normalize(String(value)).replaceAll("/", "\\") : path.normalize(String(value));
  const lower = (value) => isWindows ? canonical(value).toLowerCase() : canonical(value);
  const equalPath = (left, right) => lower(left) === lower(right);
  const inside = (value, root) => {
    const candidate = lower(value);
    const base = lower(root).replace(/[\\/]$/, "");
    return candidate === base || candidate.startsWith(`${base}\\`) || candidate.startsWith(`${base}/`);
  };
  const relativeFromRoot = (value, root) => {
    const normalized = canonical(value);
    const prefix = canonical(root).replace(/[\\/]$/, "") + (isWindows ? "\\" : path.sep);
    if (!lower(normalized).startsWith(lower(prefix))) return null;
    return normalized.slice(prefix.length).replaceAll("\\", "/");
  };

  const findCandidate = () => {
    const rawPath = env[pathKey] ?? "";
    for (const directory of String(rawPath).split(path.delimiter)) {
      if (!directory) continue;
      for (const name of candidates) {
        const executable = path.join(directory, name);
        const stat = lstat(executable);
        if (regular(stat)) return { executable, nlink: nlinkNumber(stat.nlink) };
      }
    }
    return null;
  };

  const fixedHex = (value, width) => typeof value === "string" && new RegExp(`^0x[0-9a-f]{${width}}$`, "i").test(value);
  const hash = (value) => typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
  const exactSet = (actual, expected) => Array.isArray(actual) && actual.length === expected.length && actual.every((value, index) => value === expected[index]);
  const normalizeFingerprint = (value) => {
    if (typeof value !== "string") return "";
    const compact = value.replace(/[^0-9a-f]/gi, "").toUpperCase();
    if (compact.length !== 40) return "";
    return compact.match(/../g).join(":");
  };
  const unsafeMask = (value) => {
    if (typeof value === "bigint") return value;
    if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff) return BigInt(value);
    if (typeof value === "string" && /^(?:0x)?[0-9a-f]+$/i.test(value)) {
      try { return BigInt(value); } catch { return null; }
    }
    return null;
  };
  const unsafeRight = (right) => {
    const text = String(right).toUpperCase().replace(/[ -]/g, "_");
    return ["GENERIC_ALL", "GENERIC_WRITE", "MODIFY", "FULL_CONTROL", "FILE_GENERIC_WRITE", "FILE_WRITE_DATA", "FILE_APPEND_DATA", "DELETE", "DELETE_CHILD", "WRITE_DAC", "WRITE_OWNER", "FILE_DELETE_CHILD"].includes(text);
  };
  const unsafeMaskBits = (value, { directory = false, allowAddSubdirectory = false } = {}) => {
    const mask = unsafeMask(value);
    if (mask === null) return null;
    const fileWrite = (mask & 0x00000002n) !== 0n || (!directory && (mask & 0x00000004n) !== 0n) || (directory && !allowAddSubdirectory && (mask & 0x00000004n) !== 0n);
    return (mask & 0x10000000n) !== 0n || (mask & 0x40000000n) !== 0n || fileWrite || (mask & 0x00010000n) !== 0n || (mask & 0x00000040n) !== 0n || (mask & 0x00040000n) !== 0n || (mask & 0x00080000n) !== 0n;
  };
  const safeAcl = (acl, { directory = false, path = "" } = {}) => {
    if (!acl || acl.complete !== true || typeof acl.owner !== "string" || !acl.owner || !Array.isArray(acl.entries)) return false;
    const trusted = new Set(["S-1-5-18", "S-1-5-32-544", "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464", "SYSTEM", "BUILTIN\\ADMINISTRATORS"]);
    if (!trusted.has(acl.owner)) return false;
    for (const entry of acl.entries) {
      if (!entry || typeof entry !== "object") return false;
      const objectApplies = entry.objectApplies === undefined ? entry.applies === true : entry.objectApplies === true;
      if (!objectApplies || entry.inheritOnly === true) continue;
      const rights = Array.isArray(entry.rights) ? entry.rights : [];
      const trustee = typeof entry.trustee === "string" ? entry.trustee : "";
      const unknownMask = (entry.mask !== undefined && unsafeMask(entry.mask) === null) || (entry.rightsMask !== undefined && unsafeMask(entry.rightsMask) === null);
      const allowAddSubdirectory = directory && lower(path) === "c:\\" && trustee === "S-1-5-11";
      const maskUnsafe = unsafeMaskBits(entry.mask, { directory, allowAddSubdirectory }) === true || unsafeMaskBits(entry.rightsMask, { directory, allowAddSubdirectory }) === true;
      if (!trustee || unknownMask || (!trusted.has(trustee) && (maskUnsafe || rights.some(unsafeRight)))) return false;
    }
    return true;
  };
  const safeObject = (row, { directory = false } = {}) => {
    if (!row || typeof row !== "object" || typeof row.path !== "string" || !row.path) return false;
    if (row.type !== (directory ? "directory" : "regular") || row.reparse !== false) return false;
    if (!directory && (row.ads !== false || row.device !== false || !hash(row.sha256))) return false;
    if (!fixedHex(row.identity?.volume, 16) || !fixedHex(row.identity?.fileId128, 32)) return false;
    if (!safeAcl(row.acl, { directory, path: row.path })) return false;
    if (!directory && !Array.isArray(row.ancestors)) return false;
    return true;
  };
  const sameIdentity = (left, right) => left?.identity?.volume === right?.identity?.volume && left?.identity?.fileId128 === right?.identity?.fileId128;
  const validateSignature = (signature) => Boolean(signature && signature.valid === true && signature.osStatus === "Valid" && signature.timestamped === true && signature.signer === OFFICIAL.signer && normalizeFingerprint(signature.certificateFingerprint) === OFFICIAL.certificateFingerprint);
  const validateRows = (rows, paths, expectedHash, identity, nlink) => {
    if (!Array.isArray(rows) || rows.length !== paths.length) return false;
    const expected = new Set(paths.map((item) => lower(item)));
    const seen = new Set();
    for (const row of rows) {
      if (!safeObject(row) || row.sha256 !== expectedHash || nlinkNumber(row.nlink) !== nlink || !sameIdentity(row, identity) || !Array.isArray(row.aliases) || !exactSet(row.aliases, paths) || !expected.has(lower(row.path)) || seen.has(lower(row.path))) return false;
      seen.add(lower(row.path));
    }
    return seen.size === paths.length;
  };
  const validateAncestors = (rows) => {
    if (!Array.isArray(rows)) return false;
    const seen = new Set();
    for (const row of rows) {
      if (!safeObject(row, { directory: true }) || !(inside(row.path, "C:\\Program Files") || row.path === "C:\\")) return false;
      seen.add(`${lower(row.path)}|${row.identity.volume}|${row.identity.fileId128}`);
    }
    const paths = new Set(rows.map((row) => lower(row.path)));
    const fullChain = ["C:\\", "C:\\Program Files", "C:\\Program Files\\Git", "C:\\Program Files\\Git\\cmd", "C:\\Program Files\\Git\\mingw64", "C:\\Program Files\\Git\\mingw64\\bin", "C:\\Program Files\\Git\\mingw64\\libexec", "C:\\Program Files\\Git\\mingw64\\libexec\\git-core"].map(lower);
    if (rows.length !== fullChain.length || paths.size !== fullChain.length || seen.size !== rows.length || fullChain.some((path) => !paths.has(path))) return false;
    return true;
  };
  const sameAncestors = (row, ancestors) => {
    if (!Array.isArray(row?.ancestors) || row.ancestors.length !== ancestors.length) return false;
    const expected = new Set(ancestors.map((item) => `${lower(item.path)}|${item.identity.volume}|${item.identity.fileId128}`));
    const actual = new Set();
    for (const item of row.ancestors) {
      if (!safeObject(item, { directory: true })) return false;
      actual.add(`${lower(item.path)}|${item.identity.volume}|${item.identity.fileId128}`);
    }
    return actual.size === expected.size && [...expected].every((item) => actual.has(item));
  };
  const LOADER_NAMES = Object.freeze(["advapi32.dll", "bcrypt.dll", "kernel32.dll", "kernelbase.dll", "msvcrt.dll", "ntdll.dll", "psapi.dll", "secur32.dll", "shell32.dll", "shlwapi.dll", "ucrtbase.dll", "user32.dll", "ws2_32.dll"]);
  const SYSTEM32_NAMES = new Set(["bcrypt.dll", "kernelbase.dll", "ntdll.dll", "secur32.dll", "ucrtbase.dll"]);

  const validateMetadata = (metadata, selection, candidate) => {
    if (!metadata || typeof metadata !== "object" || metadata.schema !== "git-admission.windows.v1") return "metadata schema";
    if (!metadata.release || metadata.release.productVersion !== OFFICIAL.productVersion || metadata.release.architecture !== OFFICIAL.architecture) return "release/version/architecture";
    if (!metadata.linkSet?.complete || !exactSet(metadata.linkSet.wrapper, LINK_SET.wrapper) || !exactSet(metadata.linkSet.git, LINK_SET.git)) return "incomplete link set";
    const wrapperPaths = LINK_SET.wrapper.map((relative) => `${expectedRoot}\\${relative.replaceAll("/", "\\")}`);
    const gitPaths = LINK_SET.git.map((relative) => `${expectedRoot}\\${relative.replaceAll("/", "\\")}`);
    const selectedWrapper = equalPath(candidate.executable, wrapperPaths[0]);
    const selectedGit = equalPath(candidate.executable, gitPaths[0]);
    if (!selectedWrapper && !selectedGit) return "candidate role";
    const candidateAliases = selectedWrapper ? wrapperPaths : gitPaths;
    const candidateHash = selectedWrapper ? OFFICIAL.wrapperSha256 : OFFICIAL.gitSha256;
    if (!metadata.candidate || !equalPath(metadata.candidate.path, candidate.executable) || metadata.candidate.sha256 !== candidateHash || !safeObject(metadata.candidate) || nlinkNumber(metadata.candidate.nlink) !== candidateAliases.length || !validateSignature(metadata.candidate.signature) || !exactSet(metadata.candidate.aliases, candidateAliases)) return "candidate object";
    if (!metadata.objects || !safeObject(metadata.objects.wrapper) || metadata.objects.wrapper.sha256 !== OFFICIAL.wrapperSha256 || !validateSignature(metadata.objects.wrapper.signature)) return "wrapper object";
    const wrapperRows = [metadata.objects.wrapper, ...(Array.isArray(metadata.objects.wrapperAliases) ? metadata.objects.wrapperAliases : [])];
    if (!validateRows(wrapperRows, wrapperPaths, OFFICIAL.wrapperSha256, metadata.objects.wrapper, 2)) return "wrapper alias identity";
    if (!metadata.objects.git || !safeObject(metadata.objects.git) || metadata.objects.git.sha256 !== OFFICIAL.gitSha256 || !validateSignature(metadata.objects.git.signature) || nlinkNumber(metadata.objects.git.nlink) !== 4) return "git object";
    const gitRows = [metadata.objects.git, ...(Array.isArray(metadata.objects.gitAliases) ? metadata.objects.gitAliases : [])];
    if (!validateRows(gitRows, gitPaths, OFFICIAL.gitSha256, metadata.objects.git, 4)) return "git alias identity";
    if (!sameIdentity(metadata.candidate, selectedWrapper ? metadata.objects.wrapper : metadata.objects.git)) return "candidate role identity";
    if (!Array.isArray(metadata.objects.dlls) || metadata.objects.dlls.length !== Object.keys(DLL_HASHES).length) return "DLL inventory";
    for (const [relative, expectedHash] of Object.entries(DLL_HASHES)) {
      const row = metadata.objects.dlls.find((item) => item?.relative === relative);
      const aliases = DLL_ALIASES[relative].map((item) => `${expectedRoot}\\${item.replaceAll("/", "\\")}`);
      if (!row || !safeObject(row) || row.sha256 !== expectedHash || nlinkNumber(row.nlink) !== aliases.length || !equalPath(row.path, aliases[0]) || !exactSet(row.aliases, aliases) || new Set(row.aliases.map((item) => lower(item))).size !== aliases.length) return "DLL provenance";
    }
    if (!Array.isArray(metadata.objects.ancestors) || !validateAncestors(metadata.objects.ancestors)) return "ancestor protection";
    const inspectedRows = [metadata.candidate, ...wrapperRows, ...gitRows, ...metadata.objects.dlls];
    if (inspectedRows.some((row) => !sameAncestors(row, metadata.objects.ancestors))) return "ancestor coverage";
    if (!metadata.access?.token || typeof metadata.access.token.sid !== "string" || typeof metadata.access.token.administrator !== "boolean" || metadata.access.model !== "effective-token") return "access token";
    if (!metadata.loader?.enumeration || metadata.loader.enumeration.complete !== true || metadata.loader.enumeration.rowCount !== LOADER_NAMES.length) return "loader enumeration";
    if (metadata.loader.error !== undefined || !metadata.loader.safeDllSearchMode || !["absent", "enabled"].includes(metadata.loader.safeDllSearchMode.state)) return "loader state";
    if (!Array.isArray(metadata.loader.localRedirects) || metadata.loader.localRedirects.length !== 0 || !Array.isArray(metadata.loader.appDirectoryCandidates) || metadata.loader.appDirectoryCandidates.length !== 0) return "loader redirects/predecessors";
    if (!Array.isArray(metadata.loader.knownDLLs) || metadata.loader.knownDLLs.length < 1) return "KnownDLL registry";
    const known = new Set(metadata.loader.knownDLLs.map((item) => String(item).toLowerCase()));
    if (known.size !== metadata.loader.knownDLLs.length) return "KnownDLL duplicates";
    if (!Array.isArray(metadata.loader.dependencies) || metadata.loader.dependencies.length !== LOADER_NAMES.length) return "loader dependencies";
    const dependencies = new Map();
    for (const item of metadata.loader.dependencies) {
      if (!item || typeof item.name !== "string" || dependencies.has(item.name.toLowerCase()) || !LOADER_NAMES.includes(item.name.toLowerCase()) || item.protected !== true) return "loader closure";
      dependencies.set(item.name.toLowerCase(), item);
    }
    for (const name of LOADER_NAMES) {
      const item = dependencies.get(name);
      if (!item || (SYSTEM32_NAMES.has(name) ? item.resolution !== "system32-default" || known.has(name) || !item.path || !item.identity || item.reparse !== false || item.device !== false || !safeAcl(item.acl) : item.resolution !== "known-dll" || !known.has(name))) return "loader resolution";
    }
    const observedContext = metadata.context;
    const bindingContext = metadata.binding ?? observedContext;
    if (!observedContext || observedContext.platform !== "win32" || observedContext.architecture !== "x64" || observedContext.protectedHost !== selection.host || observedContext.challengeNonce !== selection.nonce || !bindingContext || bindingContext.platform !== "win32" || bindingContext.architecture !== "x64" || bindingContext.protectedHost !== selection.host || bindingContext.cwd !== selection.cwd || !sameJson(bindingContext.env, selection.env) || bindingContext.challengeNonce !== selection.nonce) return "probe context";
    if (!metadata.redirects || metadata.redirects.stdout !== "") return "redirect state";
    return null;
  };

  const nativeQuery = (selection) => {
    if (!isWindows || !selection || typeof selection.cwd !== "string" || typeof selection.candidate !== "string" || typeof selection.nonce !== "string" || !selection.nonce) throw new Error("E_UNSAFE_GIT_EXECUTABLE: invalid probe selection");
    const hostBinding = windowsHostPath();
    const host = hostBinding?.executable;
    const helperRoot = hostBinding?.root;
    if (!hostBinding || typeof hostBinding !== "object" || typeof host !== "string" || typeof helperRoot !== "string" || !/^[A-Za-z]:\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$/i.test(host)) throw new Error("E_UNSAFE_GIT_EXECUTABLE: Windows PowerShell host is not OS anchored");
    const systemRoot = helperRoot;
    const modules = path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "Modules");
    const scrubbedEnv = {
      HOMEDRIVE: systemRoot.slice(0, 2),
      HOMEPATH: host.slice(2),
      LOGONSERVER: "",
      PATH: "",
      SYSTEMDRIVE: systemRoot.slice(0, 2),
      SYSTEMROOT: systemRoot,
      TEMP: `${systemRoot}\\Temp`,
      TMP: `${systemRoot}\\Temp`,
      USERDOMAIN: "",
      USERNAME: "",
      USERPROFILE: host,
      APPDATA: host,
      LOCALAPPDATA: host,
      HOME: host,
      WINDIR: systemRoot,
      PATHEXT: "",
      PSModulePath: modules,
    };
    const script = String.raw`
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath([string]$env:SystemRoot)
$hostPath = [IO.Path]::Combine($root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
$modulePath = [IO.Path]::Combine($root, 'System32', 'WindowsPowerShell', 'v1.0', 'Modules')
# Windows PowerShell adds protected Program Files modules during startup.
# Limit metadata operations to the OS module directory after that bootstrap.
$env:PSModulePath = $modulePath
if ([IntPtr]::Size -ne 8 -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1 -or $PSEdition -ne 'Desktop' -or $ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage' -or (Get-Location).Path -ne $root -or $env:PATH -ne '' -or $env:USERPROFILE -ne $hostPath -or $env:APPDATA -ne $hostPath -or $env:LOCALAPPDATA -ne $hostPath -or $env:HOME -ne $hostPath -or $env:PSModulePath -ne $modulePath) { exit 31 }
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
if (-not $payload -or [string]$payload.candidate -notmatch '^[A-Za-z]:\\Program Files\\Git\\(?:cmd|mingw64\\bin)\\git\.exe$') { exit 32 }
$asmName = [Reflection.AssemblyName]::new('UsefulSkillsGitTrustProbe')
$asm = [AppDomain]::CurrentDomain.DefineDynamicAssembly($asmName, [Reflection.Emit.AssemblyBuilderAccess]::Run)
$mod = $asm.DefineDynamicModule('UsefulSkillsGitTrustProbe')
$type = $mod.DefineType('Native', [Reflection.TypeAttributes]::Public -bor [Reflection.TypeAttributes]::Abstract -bor [Reflection.TypeAttributes]::Sealed)
function PInvoke($name,$dll,$returnType,$parameterTypes) {
  $m = $type.DefinePInvokeMethod($name,$dll,[Reflection.MethodAttributes]::Public -bor [Reflection.MethodAttributes]::Static -bor [Reflection.MethodAttributes]::PinvokeImpl,[Reflection.CallingConventions]::Standard,$returnType,$parameterTypes,[Runtime.InteropServices.CallingConvention]::Winapi,[Runtime.InteropServices.CharSet]::Unicode)
  $m.SetImplementationFlags($m.GetMethodImplementationFlags() -bor [Reflection.MethodImplAttributes]::PreserveSig)
}
PInvoke 'NtCreateFile' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr],[uint32],[IntPtr],[IntPtr],[IntPtr],[uint32],[uint32],[uint32],[uint32],[IntPtr],[uint32]))
PInvoke 'NtQueryInformationFile' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr],[IntPtr],[IntPtr],[uint32],[int]))
PInvoke 'NtQueryDirectoryFile' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr],[IntPtr],[IntPtr],[IntPtr],[IntPtr],[IntPtr],[uint32],[int],[bool],[IntPtr],[bool]))
PInvoke 'NtClose' 'ntdll.dll' ([int]) ([Type[]]@([IntPtr]))
PInvoke 'GetFileInformationByHandleEx' 'kernel32.dll' ([bool]) ([Type[]]@([IntPtr],[int],[IntPtr],[uint32]))
PInvoke 'GetFinalPathNameByHandleW' 'kernel32.dll' ([uint32]) ([Type[]]@([IntPtr],[Text.StringBuilder],[uint32],[uint32]))
PInvoke 'GetFileType' 'kernel32.dll' ([uint32]) ([Type[]]@([IntPtr]))
 $dwordRef = ([uint32]).MakeByRefType()
PInvoke 'FindFirstFileNameW' 'kernel32.dll' ([IntPtr]) ([Type[]]@([string],[uint32],$dwordRef,[Text.StringBuilder]))
PInvoke 'FindNextFileNameW' 'kernel32.dll' ([bool]) ([Type[]]@([IntPtr],$dwordRef,[Text.StringBuilder]))
PInvoke 'FindClose' 'kernel32.dll' ([bool]) ([Type[]]@([IntPtr]))
PInvoke 'LocalFree' 'kernel32.dll' ([IntPtr]) ([Type[]]@([IntPtr]))
PInvoke 'GetSecurityInfo' 'advapi32.dll' ([uint32]) ([Type[]]@([IntPtr],[uint32],[uint32],[IntPtr],[IntPtr],[IntPtr],[IntPtr],[IntPtr]))
PInvoke 'ConvertSecurityDescriptorToStringSecurityDescriptorW' 'advapi32.dll' ([bool]) ([Type[]]@([IntPtr],[uint32],[uint32],[IntPtr],[IntPtr]))
PInvoke 'GetLastError' 'kernel32.dll' ([uint32]) ([Type[]]@())
$native = $type.CreateType()
$handles = [Collections.Generic.List[IntPtr]]::new()
$dirs = @{}
function Fail([string]$message) { throw $message }
function Check($status,[string]$what) { if ([int]$status -lt 0) { Fail $what } }
function U16($b,$o) { return [uint32]$b[$o] -bor ([uint32]$b[$o+1] -shl 8) }
function U32($b,$o) { return [uint32]$b[$o] -bor ([uint32]$b[$o+1] -shl 8) -bor ([uint32]$b[$o+2] -shl 16) -bor ([uint32]$b[$o+3] -shl 24) }
function Hex($bytes) { return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '') }
function Norm([string]$p) { $q = [IO.Path]::GetFullPath($p); if ($q.Length -gt 3) { return $q.TrimEnd('\') }; return $q }
function Unicode([string]$text) {
  $bytes = [Text.Encoding]::Unicode.GetBytes($text); $buf = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length + 2)
  [Runtime.InteropServices.Marshal]::Copy($bytes,0,$buf,$bytes.Length); $u = [Runtime.InteropServices.Marshal]::AllocHGlobal(16)
  [Runtime.InteropServices.Marshal]::WriteInt16($u,0,[int16]$bytes.Length); [Runtime.InteropServices.Marshal]::WriteInt16($u,2,[int16]($bytes.Length + 2)); [Runtime.InteropServices.Marshal]::WriteIntPtr($u,8,$buf)
  [pscustomobject]@{ Value = $u; Buffer = $buf; Length = $bytes.Length; Bytes = $bytes }
}
function OA($rootHandle,$u) {
  $oa = [Runtime.InteropServices.Marshal]::AllocHGlobal(48); [Runtime.InteropServices.Marshal]::Copy([byte[]]::new(48),0,$oa,48)
  [Runtime.InteropServices.Marshal]::WriteInt32($oa,0,48); [Runtime.InteropServices.Marshal]::WriteIntPtr($oa,8,$rootHandle); [Runtime.InteropServices.Marshal]::WriteIntPtr($oa,16,$u.Value); [Runtime.InteropServices.Marshal]::WriteInt32($oa,24,0x40); return $oa
}
function Attr($h,[bool]$directory) {
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16); $info = [Runtime.InteropServices.Marshal]::AllocHGlobal(32)
  try {
    Check ($native::NtQueryInformationFile($h,$ios,$info,8,35)) 'attribute query failed'; $a = [Runtime.InteropServices.Marshal]::ReadInt32($info,0)
    if (($a -band 0x400) -ne 0) { Fail 'reparse point' }
    $n = 1
    if (-not $directory) { Check ($native::NtQueryInformationFile($h,$ios,$info,24,5)) 'standard query failed'; $n = [Runtime.InteropServices.Marshal]::ReadInt32($info,16); if ($n -lt 1) { Fail 'invalid link count' } }
    [pscustomobject]@{ Reparse = (($a -band 0x400) -ne 0); Nlink = $n; Device = ($native::GetFileType($h) -ne 1) }
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($info) }
}
function Identity($h) {
  $info = [Runtime.InteropServices.Marshal]::AllocHGlobal(24)
  try {
    if (-not $native::GetFileInformationByHandleEx($h,18,$info,24)) { Fail 'file id query failed' }
    $v = [byte[]]::new(8); $f = [byte[]]::new(16); [Runtime.InteropServices.Marshal]::Copy($info,$v,0,8); [Runtime.InteropServices.Marshal]::Copy([IntPtr]::Add($info,8),$f,0,16); [Array]::Reverse($v)
    [pscustomobject]@{ volume = '0x' + (Hex $v); fileId128 = '0x' + (Hex $f) }
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($info) }
}
function FinalPath($h) {
  $sb = [Text.StringBuilder]::new(1024); $n = $native::GetFinalPathNameByHandleW($h,$sb,1024,0); if ($n -eq 0 -or $n -ge 1024) { Fail 'final path query failed' }
  $p = $sb.ToString(); if ($p.StartsWith('\\?\')) { $p = $p.Substring(4) }; return (Norm $p)
}
function FindChild($directory,[string]$name) {
  $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16); $buf = [Runtime.InteropServices.Marshal]::AllocHGlobal(65536)
  try {
    $restart = $true
    while ($true) {
      $status = $native::NtQueryDirectoryFile($directory,[IntPtr]::Zero,[IntPtr]::Zero,[IntPtr]::Zero,$ios,$buf,65536,12,$false,[IntPtr]::Zero,$restart)
      if (([int64]$status -band 0xffffffffL) -eq 2147483654) { return $false }; Check $status 'directory enumeration failed'; $off = 0
      while ($true) { $next = [Runtime.InteropServices.Marshal]::ReadInt32($buf,$off); $len = [Runtime.InteropServices.Marshal]::ReadInt32($buf,$off + 8); $found = [Runtime.InteropServices.Marshal]::PtrToStringUni([IntPtr]::Add($buf,$off + 12),[int]($len / 2)); if ($found -ieq $name) { return $true }; if ($next -eq 0) { break }; $off += $next }
      $restart = $false
    }
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($buf) }
}
function OpenNative($parent,[string]$name,[bool]$directory) {
  $u = Unicode $name; $oa = OA $parent $u; $out = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size); $ios = [Runtime.InteropServices.Marshal]::AllocHGlobal(16)
  try {
    $access = if ($directory) { 0x120081 } else { 0x120089 }; $options = 0x200020 -bor $(if ($directory) { 1 } else { 0 })
    $status = $native::NtCreateFile($out,$access,$oa,$ios,[IntPtr]::Zero,0,1,1,$options,[IntPtr]::Zero,0); Check $status 'NtCreateFile failed'
    $h = [Runtime.InteropServices.Marshal]::ReadIntPtr($out); if ($h -eq [IntPtr]::Zero) { Fail 'null handle' }; [void]$handles.Add($h); Attr $h $directory | Out-Null; return $h
  } finally { [Runtime.InteropServices.Marshal]::FreeHGlobal($ios); [Runtime.InteropServices.Marshal]::FreeHGlobal($out); [Runtime.InteropServices.Marshal]::FreeHGlobal($oa); [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Value); [Runtime.InteropServices.Marshal]::FreeHGlobal($u.Buffer) }
}
function OpenChain([string]$full,[bool]$directory) {
  $absolute = Norm $full; $rootPath = [IO.Path]::GetPathRoot($absolute); $rootName = '\??\' + $rootPath; $key = $rootPath.ToLowerInvariant()
  if (-not $dirs[$key]) { $dirs[$key] = OpenNative ([IntPtr]::Zero) $rootName $true }
  $parent = $dirs[$key]; $parts = $absolute.Substring($rootPath.Length).Split('\',[StringSplitOptions]::RemoveEmptyEntries); $prefix = $rootPath.TrimEnd('\')
  foreach ($part in $parts) {
    $prefix = $prefix + '\' + $part; $k = $prefix.ToLowerInvariant(); if (-not (FindChild $parent $part)) { Fail ('missing path component ' + $part) }
    if ($dirs[$k]) { $parent = $dirs[$k]; continue }
    $isLast = $prefix.Equals($absolute,[StringComparison]::OrdinalIgnoreCase); $h = OpenNative $parent $part ($directory -and $isLast -or -not $isLast); if ($isLast) { return $h }; $dirs[$k] = $h; $parent = $h
  }
  return $parent
}
function Stream($h) { $safe = [Microsoft.Win32.SafeHandles.SafeFileHandle]::new($h,$false); return [IO.FileStream]::new($safe,[IO.FileAccess]::Read,65536,$false) }
function Hash($h) { $s = Stream $h; $sha = [Security.Cryptography.SHA256]::Create(); try { [void]$s.Seek(0,[IO.SeekOrigin]::Begin); return ([BitConverter]::ToString($sha.ComputeHash($s))).Replace('-','').ToLowerInvariant() } finally { $sha.Dispose(); $s.Dispose() } }
function Bytes($h) { $s = Stream $h; $m = [IO.MemoryStream]::new(); try { $s.CopyTo($m); return ,$m.ToArray() } finally { $s.Dispose(); $m.Dispose() } }
function Acl($h) {
$sdPtr = [IntPtr]::Zero; $owner = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size); $dacl = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size); $sd = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size); $text = [Runtime.InteropServices.Marshal]::AllocHGlobal([IntPtr]::Size); $len = [Runtime.InteropServices.Marshal]::AllocHGlobal(4); foreach ($p in @($owner,$dacl,$sd,$text)) { [Runtime.InteropServices.Marshal]::WriteIntPtr($p,[IntPtr]::Zero) }; [Runtime.InteropServices.Marshal]::WriteInt32($len,0)
  try {
    $securityStatus = [uint32]$native::GetSecurityInfo($h,1,5,$owner,[IntPtr]::Zero,$dacl,[IntPtr]::Zero,$sd); if ($securityStatus -ne 0) { Fail 'security query failed' }; $sdPtr = [Runtime.InteropServices.Marshal]::ReadIntPtr($sd); if ($sdPtr -eq [IntPtr]::Zero) { Fail 'missing security descriptor' }
    if (-not $native::ConvertSecurityDescriptorToStringSecurityDescriptorW($sdPtr,1,5,$text,$len)) { Fail 'security descriptor conversion failed' }
    $sddlPtr = [Runtime.InteropServices.Marshal]::ReadIntPtr($text); if ($sddlPtr -eq [IntPtr]::Zero) { Fail 'missing SDDL' }; $sddl = [Runtime.InteropServices.Marshal]::PtrToStringUni($sddlPtr); if ($native::LocalFree($sddlPtr) -ne [IntPtr]::Zero) { Fail 'security descriptor string free failed' }
    $raw = [Security.AccessControl.RawSecurityDescriptor]::new($sddl); if ($null -eq $raw.DiscretionaryAcl -or $null -eq $raw.Owner) { Fail 'missing DACL or owner' }; $ownerText = $raw.Owner.Value; $entries = [Collections.Generic.List[object]]::new()
    foreach ($ace in $raw.DiscretionaryAcl) { $sid = $ace.SecurityIdentifier; if ($null -eq $sid) { Fail 'ACL ACE SID unavailable' }; $inheritOnly = (([int]$ace.AceFlags -band 8) -ne 0); [void]$entries.Add([pscustomobject]@{ trustee = $sid.Value; applies = (-not $inheritOnly); objectApplies = (-not $inheritOnly); inheritOnly = $inheritOnly; rightsMask = ('0x{0:X8}' -f ([uint32]([int64]$ace.AccessMask -band 0xffffffffL))); rights = @() }) }
    return [pscustomobject]@{ complete = $true; owner = $ownerText; entries = @($entries); raw = $sddl }
  } finally { if ($sdPtr -ne [IntPtr]::Zero) { [void]$native::LocalFree($sdPtr) }; foreach ($p in @($owner,$dacl,$sd,$text,$len)) { [Runtime.InteropServices.Marshal]::FreeHGlobal($p) } }
}
function SafeAcl($acl) { $trusted = @('S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464'); if (-not $acl -or -not $acl.complete -or $trusted -notcontains $acl.owner) { return $false }; foreach ($entry in @($acl.entries)) { if (($entry.objectApplies -eq $false) -or ($entry.inheritOnly -eq $true) -or ($entry.applies -eq $false)) { continue }; if (-not $entry.trustee) { return $false }; if ($trusted -contains $entry.trustee) { continue }; try { $mask = [Convert]::ToInt64(([string]$entry.rightsMask).Replace('0x',''),16) } catch { return $false }; if (($mask -band 0x10000000) -ne 0 -or ($mask -band 0x40000000) -ne 0 -or ($mask -band 0x2) -ne 0 -or ($mask -band 0x4) -ne 0 -or ($mask -band 0x10000) -ne 0 -or ($mask -band 0x40) -ne 0 -or ($mask -band 0x40000) -ne 0 -or ($mask -band 0x80000) -ne 0) { return $false } }; return $true }
function Hardlinks([string]$path) {
  $sb = [Text.StringBuilder]::new(32768); $length = [uint32]$sb.Capacity; $search = $native::FindFirstFileNameW($path,0,[ref]$length,$sb); if ($search -eq [IntPtr]::Zero -or $search -eq [IntPtr]::new(-1)) { Fail 'hardlink enumeration failed' }; $all = [Collections.Generic.List[string]]::new()
  try {
    while ($true) {
      $n = $sb.ToString()
      if ($n.StartsWith('\')) { [void]$all.Add($path.Substring(0,2) + $n) }
      else { [void]$all.Add($path.Substring(0,2) + '\' + $n) }
      $nextCapacity = 32768
      while ($true) {
        $sb = [Text.StringBuilder]::new($nextCapacity)
        $length = [uint32]$sb.Capacity
        if ($native::FindNextFileNameW($search,[ref]$length,$sb)) { break }
        $err = $native::GetLastError()
        # FindNextFileNameW ends with ERROR_HANDLE_EOF, not ERROR_NO_MORE_FILES.
        if ($err -eq 38) { return @($all | Sort-Object) }
        if ($err -eq 234 -and $length -gt $nextCapacity) { $nextCapacity = [int]$length; continue }
        Fail 'hardlink enumeration failed'
      }
    }
  } finally {
    if (-not $native::FindClose($search)) { Fail 'hardlink close failed' }
  }
}
function Row([string]$path,[string]$relative,[bool]$directory) {
  $h = OpenChain $path $directory; $a = Attr $h $directory; $id = Identity $h; $final = FinalPath $h
  [pscustomobject]@{ relative = $relative; path = Norm $path; finalPath = $final; type = $(if ($directory) { 'directory' } else { 'regular' }); reparse = $a.Reparse; ads = $false; device = $a.Device; nlink = $a.Nlink; sha256 = $(if ($directory) { $null } else { Hash $h }); identity = $id; signature = $null; aliases = @(); ancestors = @(); acl = (Acl $h) }
}
function Signature([string]$path,$id) {
  $h = OpenChain $path $false; if ((Identity $h).fileId128 -ne $id.fileId128) { Fail 'signature path identity changed' }; $p = FinalPath $h; $beforeHash = Hash $h; $sig = Get-AuthenticodeSignature -LiteralPath $p; if ((Hash $h) -ne $beforeHash) { Fail 'signature path content changed' }; $cert = $sig.SignerCertificate; if (-not $cert) { Fail 'missing signature certificate' }; $simple = $cert.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false); $fp = ($cert.Thumbprint -replace '[^0-9A-Fa-f]','').ToUpperInvariant(); $fp = [regex]::Replace($fp,'.{2}(?=.)','$&:'); [pscustomobject]@{ valid = ($sig.Status.ToString() -eq 'Valid'); osStatus = $sig.Status.ToString(); timestamped = ($null -ne $sig.TimeStamperCertificate); signer = $simple; certificateFingerprint = $fp }
}
function Imports($h) {
  $b = Bytes $h; if ($b.Length -lt 0x100 -or $b[0] -ne 0x4d -or $b[1] -ne 0x5a) { Fail 'not PE' }; $pe = [int](U32 $b 0x3c); if ([Text.Encoding]::ASCII.GetString($b,$pe,4) -cne 'PE' + [char]0 + [char]0) { Fail 'bad PE signature' }; $machine = U16 $b ($pe + 4); if ($machine -ne 0x8664) { Fail 'non x64 PE' }; $sections = U16 $b ($pe + 6); $opt = $pe + 24; $magic = U16 $b $opt; $dir = $opt + $(if ($magic -eq 0x20b) { 112 } else { 96 }); $impRva = U32 $b ($dir + 8); if ($impRva -eq 0) { return @() }; $sec = $opt + (U16 $b ($pe + 20)); function Rva($r) { for ($i=0; $i -lt $sections; $i++) { $sh = $sec + $i * 40; $va = U32 $b ($sh + 12); $sz = [Math]::Max((U32 $b ($sh + 8)),(U32 $b ($sh + 16))); if ($r -ge $va -and $r -lt ($va + $sz)) { return (U32 $b ($sh + 20)) + ($r - $va) } }; Fail 'unmapped import RVA' }; $off = Rva $impRva; $out = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase); for ($i=0; ; $i++) { $d = $off + 20 * $i; if ((U32 $b $d) -eq 0 -and (U32 $b ($d+12)) -eq 0 -and (U32 $b ($d+16)) -eq 0) { break }; $nameOff = Rva (U32 $b ($d+12)); $end = $nameOff; while ($b[$end] -ne 0) { $end++ }; [void]$out.Add(([Text.Encoding]::ASCII.GetString($b,$nameOff,$end-$nameOff)).ToLowerInvariant()) }; return @($out)
}
function CloseAll() { $failure = $null; foreach ($h in @($handles)) { try { if ([int]$native::NtClose($h) -lt 0 -and $null -eq $failure) { $failure = 'handle close failed' } } catch { if ($null -eq $failure) { $failure = 'handle close failed' } } }; if ($failure) { Fail $failure } }
try {
  $candidate = Norm ([string]$payload.candidate); $rootGit = 'C:\Program Files\Git'; $selectedRelative = if ($candidate.Equals((Join-Path $rootGit 'cmd\git.exe'),[StringComparison]::OrdinalIgnoreCase)) { 'cmd/git.exe' } elseif ($candidate.Equals((Join-Path $rootGit 'mingw64\bin\git.exe'),[StringComparison]::OrdinalIgnoreCase)) { 'mingw64/bin/git.exe' } else { Fail 'candidate outside pinned image roles' }; $expected = [ordered]@{ wrapper = @('cmd/git.exe','cmd/git-lfs.exe'); git = @('mingw64/bin/git.exe','mingw64/bin/git-upload-pack.exe','mingw64/bin/git-receive-pack.exe','mingw64/bin/git-upload-archive.exe') }; $dllExpected = [ordered]@{ 'mingw64/bin/libiconv-2.dll' = '7a282a854e01be726c6cccfe46f548c716aa45b3014818468253aaa4efbcd067'; 'mingw64/bin/libintl-8.dll' = '0537c3dd2378218508ebe3cc416d72a99ee2d24ae1c5525e23458f32544ef861'; 'mingw64/bin/libpcre2-8-0.dll' = 'c135a87ed0f11eae8ffc4cb469671ff0b3f5d71fab5fb024e9b1e7241ca25b52'; 'mingw64/bin/libwinpthread-1.dll' = '851f61482ad5b6aac7c6abc54bbe31d24f89e0ca683a75fcec2d47f86b2d2242'; 'mingw64/bin/zlib1.dll' = '93e9243a44c29200eeacaf9658efe2558581770e4b11ca4b500e18e424a6e3b5' }
  $ancestor = [Collections.Generic.List[object]]::new(); foreach ($p in @('C:\','C:\Program Files','C:\Program Files\Git','C:\Program Files\Git\cmd','C:\Program Files\Git\mingw64','C:\Program Files\Git\mingw64\bin','C:\Program Files\Git\mingw64\libexec','C:\Program Files\Git\mingw64\libexec\git-core')) { $ancestor.Add((Row $p $null $true)) }; $objects = @{}; function AddLinks($relative,$hash,$links) { $primary = Norm ([IO.Path]::Combine($rootGit,($relative -replace '/','\'))); $r = Row $primary $relative $false; if ($r.sha256 -ne $hash) { Fail 'hash mismatch' }; $enum = @(Hardlinks $primary); $expectedPaths = @($links | ForEach-Object { Norm ([IO.Path]::Combine($rootGit,($_ -replace '/','\'))) }); $actualKey = (@($enum | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object) -join '|'); $expectedKey = (@($expectedPaths | ForEach-Object { $_.ToLowerInvariant() } | Sort-Object) -join '|'); if ($actualKey -cne $expectedKey) { Fail 'hardlink set mismatch' }; $rows = [Collections.Generic.List[object]]::new(); foreach ($p in $expectedPaths) { $x = Row $p $null $false; if ($x.identity.fileId128 -ne $r.identity.fileId128 -or $x.identity.volume -ne $r.identity.volume -or $x.sha256 -ne $r.sha256) { Fail 'hardlink identity mismatch' }; $x.aliases = $expectedPaths; $x.ancestors = @($ancestor); [void]$rows.Add($x) }; $r.aliases = $expectedPaths; $r.ancestors = @($ancestor); $r.nlink = $rows.Count; $objects[$relative] = [pscustomobject]@{ primary = $r; aliases = @($rows | Select-Object -Skip 1); rows = @($rows) } }
  AddLinks 'cmd/git.exe' '81ef35ae005ca9318018d18e3327578ce939fb99feaad6b2d7c8ab15f3de8db5' $expected.wrapper; AddLinks 'mingw64/bin/git.exe' 'cab4c4eea1d869cf9f7be73868dc9a90ad2df1b1b673e5f8c8714a576c25ea96' $expected.git
  foreach ($kv in $dllExpected.GetEnumerator()) { AddLinks $kv.Key $kv.Value @($kv.Key,($kv.Key -replace 'mingw64/bin/','mingw64/libexec/git-core/')) }
  foreach ($entry in $objects.Values) { foreach ($row in $entry.rows) { if (-not (@($row.aliases | Where-Object { $_.Equals($row.finalPath,[StringComparison]::OrdinalIgnoreCase) }).Count -eq 1)) { Fail 'final path outside enumerated hardlinks' } } }
  $objects['cmd/git.exe'].primary.signature = Signature $objects['cmd/git.exe'].primary.path $objects['cmd/git.exe'].primary.identity; $objects['mingw64/bin/git.exe'].primary.signature = Signature $objects['mingw64/bin/git.exe'].primary.path $objects['mingw64/bin/git.exe'].primary.identity
  $selectedRow = $objects[$selectedRelative].primary
  $known = [Collections.Generic.List[string]]::new(); $knownSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase); $rk = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry64); $kk = $rk.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager\KnownDLLs',$false); if ($kk) { foreach ($n in $kk.GetValueNames()) { $v = $kk.GetValue($n,$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); if ($v -is [string] -and $v) { $dll = ([IO.Path]::GetFileName($v)).ToLowerInvariant(); if ($knownSet.Add($dll)) { [void]$known.Add($dll) } } } }; if ($kk) { $kk.Dispose() }; $rk.Dispose(); if ($known.Count -lt 1) { Fail 'KnownDLL registry unavailable' }
  $safeState = 'absent'; $sr = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::LocalMachine,[Microsoft.Win32.RegistryView]::Registry64); $sk = $sr.OpenSubKey('SYSTEM\CurrentControlSet\Control\Session Manager',$false); if ($sk) { $sv = $sk.GetValue('SafeDllSearchMode',$null,[Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames); if ($null -ne $sv) { if ($sv -is [int] -and [int]$sv -eq 1) { $safeState = 'enabled' } else { Fail 'SafeDllSearchMode disabled or indeterminate' } }; $sk.Dispose() }; $sr.Dispose()
  $packageNames = @{}; foreach ($k in $dllExpected.Keys) { $packageNames[[IO.Path]::GetFileName($k).ToLowerInvariant()] = $k }; $allImports = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase); foreach ($k in $objects.Keys) { foreach ($n in @(Imports (OpenChain $objects[$k].primary.path $false))) { [void]$allImports.Add($n) } }; $actualOsImports = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase); foreach ($n in $allImports) { if (-not $packageNames.ContainsKey($n)) { [void]$actualOsImports.Add($n) } }; $expectedOs = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase); foreach ($n in @('advapi32.dll','kernel32.dll','msvcrt.dll','shell32.dll','shlwapi.dll','user32.dll','ws2_32.dll','psapi.dll','ntdll.dll','kernelbase.dll','bcrypt.dll','secur32.dll','ucrtbase.dll')) { [void]$expectedOs.Add($n) }; if (@($actualOsImports | Where-Object { -not $expectedOs.Contains($_) }).Count -ne 0) { Fail 'unexpected OS import closure' }; $importSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase); foreach ($n in $expectedOs) { [void]$importSet.Add($n) }
  $deps = [Collections.Generic.List[object]]::new(); $appCandidates = [Collections.Generic.List[object]]::new(); foreach ($name in @($importSet | Sort-Object)) { $app = $null; $basis = if ($actualOsImports.Contains($name)) { 'pe-import' } else { 'pinned-source-closure' }; foreach ($dir in @((Split-Path $candidate -Parent),(Join-Path $rootGit 'mingw64\bin'),(Join-Path $rootGit 'mingw64\libexec\git-core'))) { $p = Join-Path $dir $name; if (FindChild (OpenChain $dir $true) $name) { $app = $p; break } }; $forcedSystem = @('secur32.dll','ucrtbase.dll') -contains $name; if ($forcedSystem) { $app = $null }; if ($app) { Fail 'unexpected application DLL predecessor' } elseif ($known -contains $name) { [void]$deps.Add([pscustomobject]@{ name = $name; resolution = 'known-dll'; protected = $true; path = $null; basis = $basis; closure = 'official-release-disassembly' }) } else { $sys = Join-Path (Join-Path $root 'System32') $name; $x = Row $sys $null $false; if ($x.device -or $x.reparse -or -not $x.acl.complete -or -not (SafeAcl $x.acl) -or -not $x.finalPath.StartsWith((Join-Path $root 'System32'),[StringComparison]::OrdinalIgnoreCase)) { Fail 'unprotected System32 dependency' }; [void]$deps.Add([pscustomobject]@{ name = $name; resolution = 'system32-default'; protected = $true; path = $x.path; finalPath = $x.finalPath; device = $x.device; reparse = $x.reparse; acl = $x.acl; identity = $x.identity; sha256 = $x.sha256; basis = $basis; closure = 'official-release-disassembly' }) } }
  $local = @(); foreach ($k in $objects.Keys) { $p = $objects[$k].primary.path + '.local'; if (FindChild (OpenChain (Split-Path $p -Parent) $true) ([IO.Path]::GetFileName($p))) { $local += $p } }; if ($local.Count -ne 0) { Fail 'DLL local redirect present' }
  $release = [Diagnostics.FileVersionInfo]::GetVersionInfo($candidate); $response = [ordered]@{ schema = 'git-admission.windows.v1'; release = [ordered]@{ productVersion = [string]$release.ProductVersion; architecture = 'x64' }; candidate = $selectedRow; linkSet = [ordered]@{ complete = $true; wrapper = $expected.wrapper; git = $expected.git }; objects = [ordered]@{ wrapper = $objects['cmd/git.exe'].primary; wrapperAliases = $objects['cmd/git.exe'].aliases; git = $objects['mingw64/bin/git.exe'].primary; gitAliases = $objects['mingw64/bin/git.exe'].aliases; dlls = @($dllExpected.Keys | ForEach-Object { $objects[$_].primary }); ancestors = @($ancestor) }; access = [ordered]@{ token = [ordered]@{ sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; administrator = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }; model = 'effective-token' }; loader = [ordered]@{ enumeration = [ordered]@{ complete = $true; rowCount = $importSet.Count }; safeDllSearchMode = [ordered]@{ state = $safeState }; localRedirects = @(); knownDLLs = @($known | Sort-Object); dependencies = @($deps) }; context = [ordered]@{ platform = 'win32'; architecture = 'x64'; protectedHost = $hostPath }; redirects = [ordered]@{ stdout = '' } }
  $response.context.challengeNonce = [string]$payload.nonce
  $response.loader.localRedirects = @($local)
$recheck = OpenChain $candidate $false; $recheckIdentity = Identity $recheck; if ($recheckIdentity.fileId128 -ne $selectedRow.identity.fileId128 -or $recheckIdentity.volume -ne $selectedRow.identity.volume -or (Hash $recheck) -ne $selectedRow.sha256) { Fail 'candidate changed after version probe' }
$response.loader.appDirectoryCandidates = @($appCandidates)
  CloseAll; [Console]::Out.WriteLine(($response | ConvertTo-Json -Depth 100 -Compress))
} catch {
  $reason = ([string]$_.Exception.Message) -replace '[\r\n]+', ' '
  if ($reason.Length -gt 1024) { $reason = $reason.Substring(0,1024) }
  [Console]::Error.WriteLine('E_UNSAFE_GIT_EXECUTABLE: metadata collector refused: ' + $reason)
  try { CloseAll } catch {}
  exit 33
}
`;
    const payload = JSON.stringify({ nonce: selection.nonce, candidate: selection.candidate });
    const result = spawnSync(host, ["-NoProfile", "-NonInteractive", "-InputFormat", "None", "-OutputFormat", "Text", "-Command", script], {
      cwd: systemRoot,
      input: payload,
      env: scrubbedEnv,
      shell: false,
      windowsHide: true,
      encoding: "utf8",
    });
    if (result?.error || result?.status !== 0) throw new Error("E_UNSAFE_GIT_EXECUTABLE: Windows metadata probe failed");
    const lines = String(result.stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length !== 1) throw new Error("E_UNSAFE_GIT_EXECUTABLE: Windows metadata probe handshake failed");
    let metadata;
    try { metadata = JSON.parse(lines[0]); } catch { throw new Error("E_UNSAFE_GIT_EXECUTABLE: Windows metadata probe JSON failed"); }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("E_UNSAFE_GIT_EXECUTABLE: Windows metadata probe response invalid");
    metadata.binding = { platform: "win32", architecture: "x64", protectedHost: host, cwd: selection.cwd, env: cloneEnv(selection.env), challengeNonce: selection.nonce };
    return metadata;
  };

  const probe = (candidate, cwd, currentEnv) => {
    if (!isWindows || candidate.nlink === 1) return null;
    if (!candidate.executable.toLowerCase().endsWith(".exe") || (!equalPath(candidate.executable, `${expectedRoot}\\cmd\\git.exe`) && !equalPath(candidate.executable, `${expectedRoot}\\mingw64\\bin\\git.exe`))) return fail("PROVENANCE", "selected Git is not a pinned image entrypoint");
    if (typeof windowsHostPath !== "function") return fail("BOOTSTRAP", "Windows host path helper unavailable");
    let host;
    try {
      const hostBinding = windowsHostPath();
      host = hostBinding?.executable;
      if (!hostBinding || typeof hostBinding !== "object" || typeof host !== "string" || typeof hostBinding.root !== "string") return fail("BOOTSTRAP", "Windows PowerShell host binding invalid");
    } catch { return fail("BOOTSTRAP", "Windows host path helper failed"); }
    const nonce = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(32).toString("hex");
    const selection = { cwd, env: cloneEnv(currentEnv), nonce, candidate: candidate.executable, host };
    try {
      const metadata = typeof injectedQuery === "function" ? injectedQuery(selection) : nativeQuery(selection);
      const reason = validateMetadata(metadata, selection, candidate);
      return reason ? fail("PROVENANCE", reason) : null;
    } catch {
      return fail("PROBE", "Windows metadata validation failed");
    }
  };

  const sameInvocationContext = (cwd) => {
    if (firstCwd === undefined) {
      firstCwd = cwd;
      firstEnv = cloneEnv(env);
      return true;
    }
    return cwd === firstCwd && sameJson(firstEnv, env);
  };
  const validTuple = (args) => {
    if (!Array.isArray(args) || args.some((value) => typeof value !== "string" || value.includes("\0"))) return false;
    if (ALLOWED_TUPLES.some((tuple) => sameJson(tuple, args))) return true;
    if (args.length === 2 && args[0] === "check-ref-format" && /^refs\/(?:heads|tags)\/[A-Za-z0-9][A-Za-z0-9._/+~-]*$/.test(args[1]) && !args[1].includes("..") && !args[1].includes("//")) return true;
    if (args.length === 3 && args[0] === "symbolic-ref" && args[1] === "--quiet" && args[2].startsWith("refs/remotes/")) {
      const value = args[2].slice("refs/remotes/".length);
      return /^[A-Za-z0-9][A-Za-z0-9._-]*\/HEAD$/.test(value);
    }
    if (args.length === 3 && args[0] === "for-each-ref" && args[1] === "--format=%(refname)" && args[2].startsWith("refs/remotes/")) {
      const value = args[2].slice("refs/remotes/".length);
      return /^[A-Za-z0-9][A-Za-z0-9._-]*\/HEAD$/.test(value);
    }
    return false;
  };

  const run = (args, options = {}) => {
    if (closed || terminalFailure) return failureResult();
    if (!validTuple(args)) return fail("PROBE", "Git operation is outside the read-only admission tuple");
    if (!options || typeof options.cwd !== "string" || !options.cwd || options.cwd.includes("\0")) return fail("CONTEXT_CHANGED", "invalid working directory");
    if (!sameInvocationContext(options.cwd)) return fail("CONTEXT_CHANGED", "Git invocation context changed");
    const currentEnv = cloneEnv(env);
    const redirectKey = Object.keys(currentEnv).find((key) => key.toLowerCase() === "git_redirect_stdout");
    if (redirectKey && currentEnv[redirectKey]) return fail("CONTEXT_CHANGED", "GIT_REDIRECT_STDOUT must be empty");
    let candidate = findCandidate();
    if (!candidate || !candidate.nlink) return fail("PROVENANCE", "no regular Git executable was found");
    if (isWindows && /\.(?:cmd|bat)$/i.test(candidate.executable)) return fail("PROVENANCE", "batch Git wrappers are not admitted");
    if (isWindows && !candidate.executable.toLowerCase().endsWith(".exe")) return fail("PROVENANCE", "unknown Windows Git extension");
    if (!admitted) {
      const probeResult = probe(candidate, options.cwd, currentEnv);
      if (probeResult) return probeResult;
      approvedExecutable = candidate.executable;
      admitted = true;
    } else if (!equalPath(approvedExecutable, candidate.executable)) {
      return fail("CONTEXT_CHANGED", "Git executable changed within session");
    }
    const spawnOptions = { cwd: options.cwd, env: firstEnv, shell: false, windowsHide: true, encoding: "utf8" };
    if (Object.prototype.hasOwnProperty.call(options, "input")) spawnOptions.input = options.input;
    const result = spawnSync(candidate.executable, [...args], spawnOptions);
    if (result?.error) return { status: result.status ?? null, stdout: result.stdout ?? "", stderr: result.stderr ?? "", error: result.error };
    return { status: result?.status ?? null, stdout: result?.stdout ?? "", stderr: result?.stderr ?? "" };
  };

  return Object.freeze({ run, close: () => { closed = true; } });
};
// END GENERATED GIT TRUST

const GIT_VALUE_MISSING_STATUS = 1;

const gitSession = __createGitSession({
  fs,
  path,
  crypto,
  os,
  spawnSync,
  platform: process.platform,
  env: process.env,
  windowsHostPath: __windowsHostPath,
});

function runGit(args) {
  return gitSession.run(args, { cwd: process.cwd() });
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
