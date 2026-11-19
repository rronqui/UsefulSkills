import { describe, expect, it, vi } from "vitest";
import * as nodeFs from "node:fs";
import * as crypto from "node:crypto";
import * as os from "node:os";
import path from "node:path";
import * as vm from "node:vm";
import { createGitSession } from "./lib/git-trust-source.mjs";

/*
 * T-007 / AC-008 private test seam.
 *
 * The metadata returned by queryWindowsMetadata is a trusted-module DTO, not a
 * product/report input. These fields are concrete observations from the
 * Windows probe: PE product release, selected candidate, exact link sets,
 * object identities, effective ACLs, signatures, loader resolution and the
 * concrete probe context. Expected release/provenance hashes remain private
 * policy in the implementation; the DTO never self-authorizes archive or
 * source-commit values.
 * DTO shape is { schema, release, candidate, linkSet, objects, access, loader,
 * context, redirects }; objects contains wrapper, wrapperAliases, git,
 * gitAliases, dlls and ancestors. Each object carries path/relative/type,
 * nlink/sha256/identity/aliases/ancestors/acl; loader carries enumeration
 * completion, safeDllSearchMode, localRedirects, effective knownDLLs,
 * dependencies (resolution/path/finalPath/identity/ACL/device/reparse/basis)
 * and application-directory predecessor observations. ACL
 * fixtures use objectApplies and tokenApplies to model object scope separately
 * from effective-token membership when a hostile trustee is present.
 * context carries concrete cwd/env/challengeNonce anchors, not a trusted boolean.
 * The implementation may keep this DTO closed and unexported; only the test
 * dependency seam supplies it here.
 */

// Positive Windows metadata uses pinned bytes plus the modeled native adapter below.

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

/*
 * The Windows seam models the approved native-query boundary explicitly:
 * `node` is the small numeric dev/ino tuple a Node stat adapter may expose,
 * while `native` is the opaque, full-width volume64/fileId128 tuple emitted
 * by Identity (the volume bytes are already in the helper's canonical order).
 * The asymmetric high bits make accidental truncation or byte-order reuse
 * visible without asserting how the backend obtains the tuple.
 */
const FIXTURE_NATIVE_IDENTITY = Object.freeze({
  volume: "0xF1E2D3C4B5A69788",
  fileId128: "0xE0D1C2B3A49586771122334455667788",
});
const FIXTURE_NODE_STAT = Object.freeze({
  dev: 0x2Bn,
  ino: 0x43A1n,
});
/*
 * Physical replacement controls use real Node dev/ino only as source material.
 * The tagged mapping below is a test-adapter tuple, not an OS-native claim;
 * both metadata snapshots and live stat observations use it consistently.
 */
const MODELED_PHYSICAL_VOLUME_PREFIX = 0xA1B2C3D400000000n;
const MODELED_PHYSICAL_FILE_ID_PREFIX = 0xE0D1C2B3A4958677n << 64n;
const MODELED_VOLUME_NODE_BITS = (1n << 48n) - 1n;
const MODELED_FILE_ID_NODE_BITS = (1n << 64n) - 1n;

const WRAPPER_PATH = "C:\\Program Files\\Git\\cmd\\git.exe";
const PINNED_WRAPPER_FIXTURE = new URL("./fixtures/git-trust/git.exe", import.meta.url);
const CANDIDATE_DIR = "C:\\Program Files\\Git\\cmd";
const FALLBACK_DIR = "C:\\Users\\attacker\\bin";
const REPO_CWD = "C:\\work\\UsefulSkills";
const WINDOWS_ROOT = "C:\\Windows";
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

const GENERATED_GIT_TRUST_BEGIN = "// BEGIN GENERATED GIT TRUST (do not edit)";
const GENERATED_GIT_TRUST_END = "// END GENERATED GIT TRUST";

function loadGeneratedGitSessionFactory() {
  const hook = nodeFs.readFileSync(new URL("./hooks/pre-push.mjs", import.meta.url), "utf8");
  const start = hook.indexOf(GENERATED_GIT_TRUST_BEGIN);
  const finish = hook.indexOf(GENERATED_GIT_TRUST_END);
  if (start < 0 || finish < start) throw new Error("generated Git trust markers are missing or malformed");

  const block = hook.slice(start, finish + GENERATED_GIT_TRUST_END.length);
  const context = vm.createContext({ Buffer, Uint8Array });
  new vm.Script(`${block}\nglobalThis.__generatedGitTrustFactory = __createGitSession;`, {
    filename: "scripts/hooks/pre-push.generated-git-trust.mjs",
  }).runInContext(context);
  return context.__generatedGitTrustFactory;
}

function createGeneratedGitSession(dependencies) {
  return loadGeneratedGitSessionFactory()(dependencies);
}

// The generator's generated block is loaded in isolation; the hook's push CLI is never executed.



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
  ["check-ref-format", "refs/tags/v0.5.0"],
  ["check-ref-format", "refs/heads/feature/a+b"],
]);

const UNSAFE_RIGHTS = ["GENERIC_ALL", "DELETE_CHILD", "WRITE_DAC", "WRITE_OWNER"];

function deepClone(value) {
  return structuredClone(value);
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function safeAcl() {
  return {
    complete: true,
    owner: "S-1-5-32-544",
    entries: [
      {
        trustee: "S-1-5-32-545",
        applies: true,
        inheritOnly: false,
        rights: ["READ", "EXECUTE"],
        mask: 0x1200a9,
      },
    ],
  };
}

function safeRootAcl() {
  return {
    complete: true,
    owner: "S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464",
    entries: [
      {
        trustee: "S-1-5-11",
        applies: true,
        objectApplies: true,
        tokenApplies: true,
        inheritOnly: false,
        rights: ["FILE_ADD_SUBDIRECTORY"],
        mask: 0x4,
      },
      {
        trustee: "S-1-5-18",
        applies: true,
        inheritOnly: false,
        rights: ["READ", "EXECUTE"],
        mask: 0x1f01ff,
      },
      {
        trustee: "S-1-5-32-544",
        applies: true,
        inheritOnly: false,
        rights: ["READ", "EXECUTE"],
        mask: 0x1f01ff,
      },
    ],
  };
}

function safeAncestors() {
  const rows = [
    ["C:\\", "0x00000000000000000000000000000001", safeRootAcl()],
    ["C:\\Program Files", "0x00000000000000000000000000000011", safeAcl()],
    ["C:\\Program Files\\Git", "0x00000000000000000000000000000012", safeAcl()],
    ["C:\\Program Files\\Git\\cmd", "0x00000000000000000000000000000013", safeAcl()],
    ["C:\\Program Files\\Git\\mingw64", "0x00000000000000000000000000000014", safeAcl()],
    ["C:\\Program Files\\Git\\mingw64\\bin", "0x00000000000000000000000000000015", safeAcl()],
    ["C:\\Program Files\\Git\\mingw64\\libexec", "0x00000000000000000000000000000016", safeAcl()],
    ["C:\\Program Files\\Git\\mingw64\\libexec\\git-core", "0x00000000000000000000000000000017", safeAcl()],
  ];
  return rows.map(([path, fileId128, acl]) => ({
    path,
    type: "directory",
    reparse: false,
    identity: { volume: "0x000000008CAB0001", fileId128 },
    acl,
  }));
}

// Deterministic fixture identities only; native collector identities are verified separately.
function system32Dependency(name, fileId128) {
  const path = `${WINDOWS_ROOT}\\System32\\${name}`;
  const basis = new Set([
    "advapi32.dll",
    "kernel32.dll",
    "msvcrt.dll",
    "ntdll.dll",
    "shell32.dll",
    "shlwapi.dll",
    "user32.dll",
    "ws2_32.dll",
  ]).has(name) ? "pe-import" : "pinned-source-closure";
  return {
    name,
    resolution: "system32-default",
    protected: true,
    path,
    finalPath: path,
    sha256: `${"0".repeat(60)}${fileId128.slice(-4)}`,
    identity: { volume: "0x000000008CAB0001", fileId128 },
    reparse: false,
    device: false,
    acl: safeAcl(),
    basis,
    closure: "official-release-disassembly",
  };
}

function knownDependency(name, basis) {
  return {
    name,
    resolution: "known-dll",
    protected: true,
    path: null,
    basis,
    closure: "official-release-disassembly",
  };
}

function fileRow({ relative, absolutePath, sha256, nlink = 1, volume = "0x000000008CAB0001", fileId128, signature = null, aliases = [] }) {
  return {
    relative,
    path: absolutePath,
    type: "regular",
    reparse: false,
    ads: false,
    device: false,
    nlink,
    sha256,
    identity: {
      volume,
      fileId128: fileId128 ?? `0x${(relative.length + 100).toString(16).padStart(32, "0")}`,
    },
    aliases: aliases.length > 0 ? [...aliases] : [absolutePath],
    ancestors: safeAncestors(),
    acl: safeAcl(),
    signature,
  };
}

function makeMetadata({ candidateName = "git.exe", candidateNlink = 2 } = {}) {
  const pinned = readPinnedWrapperObservation();
  const candidatePath = path.win32.join(CANDIDATE_DIR, candidateName);
  const wrapper = fileRow({
    relative: `cmd/${candidateName}`,
    absolutePath: candidatePath,
    sha256: pinned.hash,
    nlink: candidateNlink,
    volume: pinned.identity.volume,
    fileId128: pinned.identity.fileId128,
    aliases: [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files\\Git\\cmd\\git-lfs.exe",
    ],
    signature: {
      valid: true,
      osStatus: "Valid",
      timestamped: true,
      signer: OFFICIAL.signer,
      certificateFingerprint: OFFICIAL.certificateFingerprint,
      certificateValidTo: "2026-05-05T23:59:59Z",
    },
  });
  const lfs = fileRow({
    relative: "cmd/git-lfs.exe",
    absolutePath: "C:\\Program Files\\Git\\cmd\\git-lfs.exe",
    sha256: pinned.hash,
    nlink: 2,
    volume: pinned.identity.volume,
    fileId128: pinned.identity.fileId128,
    aliases: [...wrapper.aliases],
    signature: { ...wrapper.signature },
  });
  const git = fileRow({
    relative: "mingw64/bin/git.exe",
    absolutePath: "C:\\Program Files\\Git\\mingw64\\bin\\git.exe",
    sha256: OFFICIAL.gitSha256,
    nlink: 4,
    fileId128: "0x0000000000000000000200000004576A",
    aliases: [
      "C:\\Program Files\\Git\\mingw64\\bin\\git.exe",
      "C:\\Program Files\\Git\\mingw64\\bin\\git-upload-pack.exe",
      "C:\\Program Files\\Git\\mingw64\\bin\\git-receive-pack.exe",
      "C:\\Program Files\\Git\\mingw64\\bin\\git-upload-archive.exe",
    ],
    signature: {
      valid: true,
      osStatus: "Valid",
      timestamped: true,
      signer: OFFICIAL.signer,
      certificateFingerprint: OFFICIAL.certificateFingerprint,
      certificateValidTo: "2026-05-05T23:59:59Z",
    },
  });
  const gitAliases = git.aliases.slice(1).map((absolutePath, index) => fileRow({
    relative: absolutePath.slice("C:\\Program Files\\Git\\".length).replaceAll("\\", "/"),
    absolutePath,
    sha256: OFFICIAL.gitSha256,
    nlink: 4,
    fileId128: git.identity.fileId128,
    aliases: [...git.aliases],
    signature: { ...git.signature },
  }));
  const dlls = Object.entries(DLL_HASHES).map(([relative, sha256], index) => fileRow({
    relative,
    absolutePath: `C:\\Program Files\\Git\\${relative.replaceAll("/", "\\")}`,
    sha256,
    nlink: 2,
    fileId128: `0x${(200 + index).toString(16).padStart(32, "0")}`,
    aliases: [
      `C:\\Program Files\\Git\\${relative.replaceAll("/", "\\")}`,
      `C:\\Program Files\\Git\\${relative.replace("mingw64/bin/", "mingw64/libexec/git-core/").replaceAll("/", "\\")}`,
    ],
  }));

  return {
    schema: "git-admission.windows.v1",
    release: {
      productVersion: OFFICIAL.productVersion,
      architecture: OFFICIAL.architecture,
    },
    candidate: wrapper,
    linkSet: {
      complete: true,
      wrapper: ["cmd/git.exe", "cmd/git-lfs.exe"],
      git: [
        "mingw64/bin/git.exe",
        "mingw64/bin/git-upload-pack.exe",
        "mingw64/bin/git-receive-pack.exe",
        "mingw64/bin/git-upload-archive.exe",
      ],
    },
    objects: {
      wrapper,
      wrapperAliases: [lfs],
      git,
      gitAliases,
      dlls,
      ancestors: safeAncestors(),
    },
    access: {
      token: { administrator: false, sid: "S-1-5-21-fixture-user" },
      model: "effective-token",
    },
    loader: {
      enumeration: { complete: true, rowCount: 13 },
      safeDllSearchMode: { state: "absent" },
      localRedirects: [],
      knownDLLs: [
        "kernel32.dll",
        "wow64cpu.dll",
        "wowarmhw.dll",
        "xtajit.dll",
        "advapi32.dll",
        "clbcatq.dll",
        "combase.dll",
        "comdlg32.dll",
        "coml2.dll",
        "difxapi.dll",
        "gdi32.dll",
        "gdiplus.dll",
        "imagehlp.dll",
        "imm32.dll",
        "msctf.dll",
        "msvcrt.dll",
        "normaliz.dll",
        "nsi.dll",
        "ole32.dll",
        "oleaut32.dll",
        "psapi.dll",
        "rpcrt4.dll",
        "sechost.dll",
        "setupapi.dll",
        "shcore.dll",
        "shell32.dll",
        "shlwapi.dll",
        "user32.dll",
        "wldap32.dll",
        "wow64.dll",
        "wow64base.dll",
        "wow64con.dll",
        "wow64win.dll",
        "ws2_32.dll",
        "xtajit64.dll",
        "xtajitf.dll",
        "xtajitse.dll",
        "xtajit64se.dll",
      ],
      dependencies: [
        knownDependency("advapi32.dll", "pe-import"),
        system32Dependency("bcrypt.dll", "0x00000000000000000000000000001001"),
        knownDependency("kernel32.dll", "pe-import"),
        system32Dependency("kernelbase.dll", "0x00000000000000000000000000001002"),
        knownDependency("msvcrt.dll", "pe-import"),
        system32Dependency("ntdll.dll", "0x00000000000000000000000000001003"),
        knownDependency("psapi.dll", "pinned-source-closure"),
        system32Dependency("secur32.dll", "0x00000000000000000000000000001004"),
        knownDependency("shell32.dll", "pe-import"),
        knownDependency("shlwapi.dll", "pe-import"),
        system32Dependency("ucrtbase.dll", "0x00000000000000000000000000001005"),
        knownDependency("user32.dll", "pe-import"),
        knownDependency("ws2_32.dll", "pe-import"),
      ],
      appDirectoryCandidates: [],
    },
    context: {
      platform: "win32",
      architecture: "x64",
      protectedHost: POWERSHELL,
      cwd: REPO_CWD,
      env: {
        Path: `${CANDIDATE_DIR};${FALLBACK_DIR}`,
        HOME: "C:\\Users\\fixture",
        USERPROFILE: "C:\\Users\\fixture",
        GIT_EXEC_PATH: "C:\\Program Files\\Git\\mingw64\\libexec\\git-core",
      },
      challengeNonce: "",
      stdout: "captured",
    },
    redirects: { stdout: "" },
  };
}

function allRows(metadata) {
  return [
    metadata.candidate,
    metadata.objects.wrapper,
    ...metadata.objects.wrapperAliases,
    metadata.objects.git,
    ...metadata.objects.gitAliases,
    ...metadata.objects.dlls,
    ...metadata.objects.ancestors,
  ];
}

function fakeFs({ candidateName = "git.exe", candidateNlink = 2, includeFallback = false } = {}) {
  const candidate = path.win32.join(CANDIDATE_DIR, candidateName);
  const pinned = readPinnedWrapperObservation();
  const entries = new Map([[
    candidate,
    {
      nlink: candidateNlink,
      type: "file",
      symlink: false,
      bytes: Buffer.from(pinned.bytes),
      node: { dev: FIXTURE_NODE_STAT.dev, ino: FIXTURE_NODE_STAT.ino },
      native: { volume: pinned.identity.volume, fileId128: pinned.identity.fileId128 },
    },
  ]]);
  if (includeFallback) {
    entries.set(path.win32.join(FALLBACK_DIR, "git.exe"), {
      nlink: 1,
      type: "file",
      symlink: false,
      bytes: Buffer.from("untrusted fallback candidate"),
      node: { dev: 0xdeadn, ino: 0xbeefn },
      native: { volume: "0x0102030405060708", fileId128: "0x887766554433221100FFEEDDCCBBAA99" },
    });
  }
  const find = (target) => {
    const row = entries.get(String(target));
    if (!row) {
      const error = new Error(`ENOENT: ${target}`);
      error.code = "ENOENT";
      throw error;
    }
    return row;
  };
  const lstatSync = vi.fn((target) => {
    const row = find(target);
    return {
      isFile: () => row.type === "file",
      isDirectory: () => row.type === "directory",
      isSymbolicLink: () => row.symlink,
      nlink: row.nlink,
    };
  });
  const statSync = vi.fn((target, options) => {
    const row = find(target);
    const native = options?.bigint === true;
    return {
      isFile: () => row.type === "file",
      isDirectory: () => row.type === "directory",
      isSymbolicLink: () => row.symlink,
      nlink: native ? BigInt(row.nlink) : row.nlink,
      ...(native ? {
        dev: row.node.dev,
        ino: row.node.ino,
        volume: row.native.volume,
        fileId128: row.native.fileId128,
      } : {}),
    };
  });
  const readFileSync = vi.fn((target) => Buffer.from(find(target).bytes));
  return {
    lstatSync,
    statSync,
    readFileSync,
    existsSync: (target) => entries.has(String(target)),
    realpathSync: { native: vi.fn((target) => String(target)) },
  };
}
function makeDependencies({
  metadata = makeMetadata(),
  candidateName = "git.exe",
  candidateNlink = metadata.candidate.nlink,
  includeFallback = false,
  env = {},
  queryWindowsMetadata = null,
} = {}) {
  const spawnSync = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
  const query = queryWindowsMetadata ?? vi.fn(({ nonce, ...selection }) => {
    if (!nonce) throw new Error("metadata nonce missing");
    if (!selection || typeof selection !== "object") throw new Error("metadata selection missing");
    const observed = deepClone(metadata);
    if (observed.context) {
      if (observed.context.challengeNonce === "") observed.context.challengeNonce = nonce;
      if (observed.context.cwd !== undefined && selection.cwd) observed.context.cwd = selection.cwd;
      if (observed.context.env !== undefined && selection.env) observed.context.env = deepClone(selection.env);
    }
    return deepFreeze(observed);
  });
  const dependencies = {
    fs: fakeFs({ candidateName, candidateNlink, includeFallback }),
    path: path.win32,
    crypto,
    os,
    spawnSync,
    platform: "win32",
    env: {
      Path: `${CANDIDATE_DIR};${FALLBACK_DIR}`,
      HOME: "C:\\Users\\fixture",
      USERPROFILE: "C:\\Users\\fixture",
      GIT_EXEC_PATH: "C:\\Program Files\\Git\\mingw64\\libexec\\git-core",
      ...env,
    },
    windowsHostPath: vi.fn(() => ({ executable: POWERSHELL, root: WINDOWS_ROOT })),
    queryWindowsMetadata: query,
  };
  return { dependencies, spawnSync, query, metadata };
}

/*
 * These regressions copy the pinned executable read-only into a fresh owned
 * directory, then replace only that owned path. The race is not predicated on
 * a privileged writer defeating the installed Git ACL; it verifies that a
 * session cannot rely on pathname retention even when the candidate path is
 * replaced by an authorized concurrent filesystem actor.
 */
function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

let pinnedWrapperObservation;
function readPinnedWrapperObservation() {
  if (pinnedWrapperObservation) return pinnedWrapperObservation;
  const bytes = nodeFs.readFileSync(PINNED_WRAPPER_FIXTURE);
  const stat = nodeFs.statSync(PINNED_WRAPPER_FIXTURE, { bigint: true });
  if (!Buffer.isBuffer(bytes) || !stat?.isFile?.() || stat?.isSymbolicLink?.()) {
    throw new Error("pinned Git wrapper fixture is incomplete");
  }
  const hash = sha256Bytes(bytes);
  if (hash !== OFFICIAL.wrapperSha256) {
    throw new Error(`pinned Git wrapper hash mismatch: expected ${OFFICIAL.wrapperSha256}, got ${hash}`);
  }
  pinnedWrapperObservation = Object.freeze({
    bytes: Buffer.from(bytes),
    hash,
    identity: FIXTURE_NATIVE_IDENTITY,
  });
  return pinnedWrapperObservation;
}


function modeledPhysicalNativeIdentity(stat) {
  const volume = MODELED_PHYSICAL_VOLUME_PREFIX | (BigInt(stat.dev) & MODELED_VOLUME_NODE_BITS);
  const fileId128 = MODELED_PHYSICAL_FILE_ID_PREFIX | (BigInt(stat.ino) & MODELED_FILE_ID_NODE_BITS);
  return {
    volume: `0x${volume.toString(16).padStart(16, "0")}`,
    fileId128: `0x${fileId128.toString(16).padStart(32, "0")}`,
  };
}

function actualFileObservation(file) {
  const bytes = nodeFs.readFileSync(file);
  const stat = nodeFs.statSync(file, { bigint: true });
  return {
    bytes,
    hash: sha256Bytes(bytes),
    nlink: Number(stat.nlink),
    identity: modeledPhysicalNativeIdentity(stat),
  };
}

function createOwnedBinaryReplacement() {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "git-trust-owned-"));
  const candidate = path.join(root, "git.exe");
  const candidateAlias = path.join(root, "git-lfs.exe");
  const replacementSource = path.join(root, "replacement.exe");
  const replacementAlias = path.join(root, "replacement-lfs.exe");
  const displaced = path.join(root, "displaced.exe");

  try {
    nodeFs.copyFileSync(WRAPPER_PATH, candidate);
    nodeFs.linkSync(candidate, candidateAlias);
    const initialBytes = nodeFs.readFileSync(candidate);
    const replacementBytes = Buffer.from(initialBytes);
    replacementBytes[replacementBytes.length - 1] ^= 0xff;
    nodeFs.writeFileSync(replacementSource, replacementBytes);
    nodeFs.linkSync(replacementSource, replacementAlias);

    const initial = actualFileObservation(candidate);
    const replacement = actualFileObservation(replacementSource);
    let replaceCount = 0;
    return {
      root,
      candidate,
      initial,
      replacement,
      replace() {
        if (replaceCount > 0) return;
        nodeFs.renameSync(candidate, displaced);
        nodeFs.renameSync(replacementSource, candidate);
        replaceCount += 1;
      },
      get replaceCount() {
        return replaceCount;
      },
      cleanup() {
        nodeFs.rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    nodeFs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function bindActualWrapperObservation(metadata, observation) {
  const rows = [
    metadata.candidate,
    metadata.objects.wrapper,
    ...metadata.objects.wrapperAliases,
  ];
  for (const row of rows) {
    row.sha256 = observation.hash;
    row.nlink = observation.nlink;
    row.identity = deepClone(observation.identity);
  }
  return metadata;
}

function makeOwnedBinaryDependencies({ owned, metadata = makeMetadata(), replaceOnProbe = false } = {}) {
  const observations = [];
  const query = vi.fn(({ nonce, ...selection }) => {
    if (!nonce) throw new Error("metadata nonce missing");
    if (!selection || typeof selection !== "object") throw new Error("metadata selection missing");
    const observation = actualFileObservation(owned.candidate);
    observations.push(observation);
    const observed = bindActualWrapperObservation(deepClone(metadata), observation);
    if (observed.context) {
      observed.context.challengeNonce = nonce;
      observed.context.cwd = selection.cwd;
      observed.context.env = deepClone(selection.env);
    }
    if (replaceOnProbe && owned.replaceCount === 0) owned.replace();
    return deepFreeze(observed);
  });
  const fixture = makeDependencies({ metadata, queryWindowsMetadata: query });
  const baseLstat = fixture.dependencies.fs.lstatSync;
  const baseStat = fixture.dependencies.fs.statSync;
  const baseReadFileSync = fixture.dependencies.fs.readFileSync;
  const lstatSync = vi.fn((target) => {
    if (String(target).toLowerCase() === WRAPPER_PATH.toLowerCase()) {
      return nodeFs.lstatSync(owned.candidate);
    }
    return baseLstat(target);
  });
  const statSync = vi.fn((target, options) => {
    if (String(target).toLowerCase() === WRAPPER_PATH.toLowerCase()) {
      const stat = nodeFs.statSync(owned.candidate, options);
      if (options?.bigint === true) {
        Object.assign(stat, modeledPhysicalNativeIdentity(stat));
      }
      return stat;
    }
    return baseStat(target, options);
  });
  const readFileSync = vi.fn((target, options) => {
    if (String(target).toLowerCase() === WRAPPER_PATH.toLowerCase()) {
      return nodeFs.readFileSync(owned.candidate, options);
    }
    return baseReadFileSync(target, options);
  });
  fixture.dependencies.fs = {
    ...fixture.dependencies.fs,
    lstatSync,
    statSync,
    readFileSync,
  };
  const spawned = [];
  fixture.spawnSync.mockImplementation((executable, args, options) => {
    spawned.push({
      executable,
      args: [...args],
      options,
      bytes: nodeFs.readFileSync(owned.candidate),
    });
    return { status: 0, stdout: "", stderr: "" };
  });
  return { ...fixture, query, observations, spawned };
}
const POSIX_GIT_FACTORIES = Object.freeze([
  ["source factory", createGitSession],
  ["materialized pre-push factory (existingVMloader)", createGeneratedGitSession],
]);

function createPosixGitFixture({ hardlink = false } = {}) {
  const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), "git-trust-posix-"));
  const candidate = path.join(root, "git");
  const alias = path.join(root, "git-hardlink");
  const bytes = Buffer.from("#!/bin/sh\nexit 0\n", "utf8");
  try {
    nodeFs.writeFileSync(candidate, bytes, { mode: 0o755 });
    nodeFs.chmodSync(candidate, 0o755);
    const addHardlink = () => nodeFs.linkSync(candidate, alias);
    if (hardlink) addHardlink();

    const spawnSync = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));
    const queryWindowsMetadata = vi.fn(() => {
      throw new Error("POSIX Git admission must not query Windows metadata");
    });
    const windowsHostPath = vi.fn(() => {
      throw new Error("POSIX Git admission must not bootstrap Windows PowerShell");
    });
    return {
      root,
      candidate,
      alias,
      addHardlink,
      spawnSync,
      queryWindowsMetadata,
      windowsHostPath,
      dependencies: {
        fs: nodeFs,
        path: path.posix,
        crypto,
        os,
        spawnSync,
        platform: process.platform,
        env: { PATH: root },
        windowsHostPath,
        queryWindowsMetadata,
      },
      cleanup() {
        nodeFs.rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    nodeFs.rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function posixRun(session, fixture, args = ALLOWED_TUPLES[0]) {
  return session.run(args, { cwd: fixture.root });
}


function run(session, args = ALLOWED_TUPLES[0], options = {}) {
  return session.run(args, { cwd: REPO_CWD, ...options });
}

function expectUnsafe(result) {
  expect(result?.error).toEqual(expect.objectContaining({ code: "E_UNSAFE_GIT_EXECUTABLE" }));
  expect(result?.status).toBeNull();
}

function mutateEveryObject(metadata, mutate) {
  for (const row of allRows(metadata)) mutate(row);
}
function removeNativeIdentity(stat) {
  for (const field of ["dev", "ino", "volume", "fileId", "fileId128", "identity"]) delete stat[field];
}
describe.each(POSIX_GIT_FACTORIES)("AC-008 Git admission session %s", (factoryName, createFactory) => {
  it.skipIf(process.platform === "win32")(
    "rejects an actual POSIX hardlinked Git candidate before the first Git spawn",
    (context) => {
      let fixture;
      try {
        fixture = createPosixGitFixture({ hardlink: true });
      } catch (error) {
        context.skip(`POSIX hardlink fixture unavailable: ${error?.code ?? error?.message ?? error}`);
        return;
      }
      try {
        const candidateStat = nodeFs.lstatSync(fixture.candidate, { bigint: true });
        const aliasStat = nodeFs.lstatSync(fixture.alias, { bigint: true });
        expect(candidateStat.nlink).toBe(2n);
        expect(aliasStat.nlink).toBe(2n);
        expect(aliasStat.dev).toBe(candidateStat.dev);
        expect(aliasStat.ino).toBe(candidateStat.ino);

        const session = createFactory(fixture.dependencies);
        const result = posixRun(session, fixture);

        expectUnsafe(result);
        expect(fixture.spawnSync).not.toHaveBeenCalled();
        expect(fixture.queryWindowsMetadata).not.toHaveBeenCalled();
        expect(fixture.windowsHostPath).not.toHaveBeenCalled();
      } finally {
        fixture.cleanup();
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "admits a single-link POSIX Git candidate and the first valid spawn proves the fixture legitimate",
    (context) => {
      let fixture;
      try {
        fixture = createPosixGitFixture();
      } catch (error) {
        context.skip(`POSIX single-link fixture unavailable: ${error?.code ?? error?.message ?? error}`);
        return;
      }
      try {
        const candidateStat = nodeFs.lstatSync(fixture.candidate, { bigint: true });
        expect(candidateStat.nlink).toBe(1n);

        const session = createFactory(fixture.dependencies);
        const result = posixRun(session, fixture);

        expect(result.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
        expect(result.status).toBe(0);
        expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
        expect(fixture.spawnSync).toHaveBeenCalledWith(
          fixture.candidate,
          ALLOWED_TUPLES[0],
          expect.objectContaining({ cwd: fixture.root, shell: false }),
        );
      } finally {
        fixture.cleanup();
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a hardlinked POSIX Git candidate on the second invocation after legitimate admission",
    (context) => {
      let fixture;
      try {
        fixture = createPosixGitFixture();
      } catch (error) {
        context.skip(`POSIX single-link fixture unavailable: ${error?.code ?? error?.message ?? error}`);
        return;
      }
      try {
        expect(nodeFs.lstatSync(fixture.candidate, { bigint: true }).nlink).toBe(1n);

        const session = createFactory(fixture.dependencies);
        const first = posixRun(session, fixture);
        expect(first.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
        expect(first.status).toBe(0);
        expect(fixture.spawnSync).toHaveBeenCalledTimes(1);

        try {
          fixture.addHardlink();
        } catch (error) {
          context.skip(`POSIX hardlink fixture unavailable: ${error?.code ?? error?.message ?? error}`);
          return;
        }
        const candidateStat = nodeFs.lstatSync(fixture.candidate, { bigint: true });
        const aliasStat = nodeFs.lstatSync(fixture.alias, { bigint: true });
        expect(candidateStat.nlink).toBe(2n);
        expect(aliasStat.nlink).toBe(2n);
        expect(aliasStat.dev).toBe(candidateStat.dev);
        expect(aliasStat.ino).toBe(candidateStat.ino);

        const later = posixRun(session, fixture, ALLOWED_TUPLES[1]);

        expectUnsafe(later);
        expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
        expect(fixture.queryWindowsMetadata).not.toHaveBeenCalled();
        expect(fixture.windowsHostPath).not.toHaveBeenCalled();
      } finally {
        fixture.cleanup();
      }
    },
  );
});




describe("AC-008 Git admission session", () => {
  it.each([
    ["source", createGitSession],
    ["generated", createGeneratedGitSession],
  ])("%s revalidates the loaded Git closure before a later spawn", (_label, factory) => {
    for (const mutate of [
      metadata => { metadata.objects.dlls[0].sha256 = "0".repeat(64); },
      metadata => { metadata.objects.git.sha256 = "0".repeat(64); },
      metadata => {
        const directory = metadata.objects.ancestors[2];
        directory.identity.fileId128 = "0x" + "1".repeat(32);
        for (const row of allRows(metadata).filter(row => Array.isArray(row.ancestors))) {
          row.ancestors.find(item => item.path === directory.path).identity.fileId128 = directory.identity.fileId128;
        }
      },
    ]) {
      const fixture = makeDependencies();
      const session = factory(fixture.dependencies);
      expect(run(session).status).toBe(0);
      mutate(fixture.metadata);
      expectUnsafe(run(session, ALLOWED_TUPLES[1]));
      expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
    }
  });

  it("bounds the native PowerShell probe and reports its timeout before any Git spawn", () => {
    const fixture = makeDependencies();
    delete fixture.dependencies.queryWindowsMetadata;
    fixture.spawnSync.mockReturnValue({ status: null, error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }) });
    const before = fixture.dependencies.fs.readFileSync(WRAPPER_PATH);
    expectUnsafe(run(createGitSession(fixture.dependencies)));
    expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
    expect(fixture.spawnSync).toHaveBeenCalledWith(POWERSHELL, expect.any(Array), expect.objectContaining({ timeout: 30_000, maxBuffer: 4 * 1024 * 1024, shell: false, windowsHide: true }));
    expect(fixture.dependencies.fs.readFileSync(WRAPPER_PATH)).toEqual(before);
  });

  it.each([
    ["check-ref-format", "refs/heads/ação-東京"],
    ["check-ref-format", "refs/tags/build;$HOME'\"(ok)"],
    ["symbolic-ref", "--quiet", "refs/remotes/ação+origin/HEAD"],
    ["for-each-ref", "--format=%(refname)", "refs/remotes/team/ação+origin/HEAD"],
  ])("passes a legitimate Git name through argv: %j", (...args) => {
    const fixture = makeDependencies();
    fixture.spawnSync.mockReturnValue({ status: 1, stdout: "original output\n", stderr: "original diagnostic\n" });
    const result = run(createGitSession(fixture.dependencies), args);
    expect(result).toEqual({ status: 1, stdout: "original output\n", stderr: "original diagnostic\n" });
    expect(fixture.spawnSync).toHaveBeenCalledWith(WRAPPER_PATH, args, expect.objectContaining({ shell: false }));
  });

  it("does not probe or execute when the session is closed, and close is idempotent", () => {
    const fixture = makeDependencies();
    const session = createGitSession(fixture.dependencies);
    expect(session).not.toHaveProperty("approvedPath");
    expect(session).not.toHaveProperty("executable");

    session.close();
    session.close();
    const result = run(session);

    expect(result.status).toBeNull();
    expect(result.error).toBeTruthy();
    expect(fixture.query).not.toHaveBeenCalled();
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a changed cwd or environment after the first admitted call", () => {
    const fixture = makeDependencies();
    const session = createGitSession(fixture.dependencies);
    const first = run(session);
    expect(first.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
    const afterFirst = fixture.spawnSync.mock.calls.length;

    const changedCwd = session.run(ALLOWED_TUPLES[1], { cwd: "C:\\other-repository" });
    expectUnsafe(changedCwd);
    expect(fixture.spawnSync).toHaveBeenCalledTimes(afterFirst);

    fixture.dependencies.env.HOME = "C:\\Users\\changed";
    const changedEnvironment = session.run(ALLOWED_TUPLES[1], { cwd: REPO_CWD });
    expectUnsafe(changedEnvironment);
    expect(fixture.spawnSync).toHaveBeenCalledTimes(afterFirst);
  });

  it.skipIf(process.platform !== "win32")(
    "rejects an owned binary replaced after metadata admission before the first Git spawn (Windows-only: pinned Git bytes and hardlink identities are required)",
    (context) => {
      if (!nodeFs.existsSync(WRAPPER_PATH)) {
        context.skip(`requires the pinned Windows Git executable at ${WRAPPER_PATH}`);
        return;
      }
      let owned;
      try {
        owned = createOwnedBinaryReplacement();
      } catch (error) {
        context.skip(`owned Windows binary fixture requires copy and hardlink support: ${error?.code ?? error?.message}`);
        return;
      }
      try {
        if (owned.initial.hash !== OFFICIAL.wrapperSha256) {
          context.skip(`requires Git for Windows ${OFFICIAL.productVersion} bytes at ${WRAPPER_PATH}`);
          return;
        }
        expect(owned.initial.nlink).toBe(2);
        expect(owned.replacement.nlink).toBe(2);
        expect(owned.replacement.hash).not.toBe(owned.initial.hash);
        expect(owned.replacement.identity).not.toEqual(owned.initial.identity);

        const fixture = makeOwnedBinaryDependencies({ owned, replaceOnProbe: true });
        const session = createGitSession(fixture.dependencies);
        const result = run(session);

        expectUnsafe(result);
        expect(fixture.query).toHaveBeenCalled();
        expect(fixture.observations[0]).toEqual(expect.objectContaining({
          hash: owned.initial.hash,
          identity: owned.initial.identity,
          bytes: owned.initial.bytes,
        }));
        expect(owned.replaceCount).toBe(1);
        expect(fixture.spawnSync).not.toHaveBeenCalled();
        expect(fixture.spawned).toHaveLength(0);
      } finally {
        owned.cleanup();
      }
    },
  );

  it.skipIf(process.platform !== "win32")(
    "rejects an owned binary replaced after an admitted call before a later Git spawn (Windows-only: pinned Git bytes and hardlink identities are required)",
    (context) => {
      if (!nodeFs.existsSync(WRAPPER_PATH)) {
        context.skip(`requires the pinned Windows Git executable at ${WRAPPER_PATH}`);
        return;
      }
      let owned;
      try {
        owned = createOwnedBinaryReplacement();
      } catch (error) {
        context.skip(`owned Windows binary fixture requires copy and hardlink support: ${error?.code ?? error?.message}`);
        return;
      }
      try {
        if (owned.initial.hash !== OFFICIAL.wrapperSha256) {
          context.skip(`requires Git for Windows ${OFFICIAL.productVersion} bytes at ${WRAPPER_PATH}`);
          return;
        }
        expect(owned.initial.nlink).toBe(2);
        expect(owned.replacement.nlink).toBe(2);
        expect(owned.replacement.hash).not.toBe(owned.initial.hash);
        expect(owned.replacement.identity).not.toEqual(owned.initial.identity);

        const fixture = makeOwnedBinaryDependencies({ owned });
        const session = createGitSession(fixture.dependencies);
        const first = run(session);

        expect(fixture.observations[0]).toEqual(expect.objectContaining({
          hash: owned.initial.hash,
          identity: owned.initial.identity,
          bytes: owned.initial.bytes,
        }));
        expect(first.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
        expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
        expect(fixture.spawned[0].bytes).toEqual(owned.initial.bytes);

        expect(sha256Bytes(fixture.spawned[0].bytes)).toBe(owned.initial.hash);
        owned.replace();
        const later = run(session, ALLOWED_TUPLES[1]);

        expectUnsafe(later);
        expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
        expect(fixture.spawned).toHaveLength(1);
      } finally {
        owned.cleanup();
      }
    },
  );

  it("rejects every missing or indeterminate mandatory predicate before Git spawn", () => {
    const cases = [
      ["release", (metadata) => { metadata.release = undefined; }],
      ["candidate path", (metadata) => { metadata.candidate.path = undefined; }],
      ["candidate aliases", (metadata) => { metadata.candidate.aliases = undefined; }],
      ["candidate hash", (metadata) => { metadata.candidate.sha256 = undefined; }],
      ["candidate signature", (metadata) => { metadata.candidate.signature = undefined; }],
      ["candidate identity", (metadata) => { metadata.candidate.identity = undefined; }],
      ["candidate ancestors", (metadata) => { metadata.candidate.ancestors = undefined; }],
      ["candidate ACL", (metadata) => { metadata.candidate.acl = undefined; }],
      ["exact linkset", (metadata) => { metadata.linkSet = undefined; }],
      ["linkset completeness", (metadata) => { metadata.linkSet.complete = false; }],
      ["wrapper object", (metadata) => { metadata.objects.wrapper = undefined; }],
      ["wrapper aliases", (metadata) => { metadata.objects.wrapperAliases = undefined; }],
      ["Git object", (metadata) => { metadata.objects.git = undefined; }],
      ["Git aliases", (metadata) => { metadata.objects.gitAliases = undefined; }],
      ["DLL inventory", (metadata) => { metadata.objects.dlls = undefined; }],
      ["DLL alias observation", (metadata) => { metadata.objects.dlls[0].aliases = undefined; }],
      ["effective access token", (metadata) => { metadata.access.token = undefined; }],
      ["loader enumeration", (metadata) => { metadata.loader.enumeration = { complete: false, rowCount: 0 }; }],
      ["loader error", (metadata) => { metadata.loader.error = "metadata probe failed"; }],
      ["SafeDllSearchMode", (metadata) => { metadata.loader.safeDllSearchMode = undefined; }],
      ["loader redirects", (metadata) => { metadata.loader.localRedirects = undefined; }],
      ["KnownDLL registry", (metadata) => { metadata.loader.knownDLLs = undefined; }],
      ["loader dependencies", (metadata) => { metadata.loader.dependencies = undefined; }],
      ["application predecessor observations", (metadata) => { metadata.loader.appDirectoryCandidates = undefined; }],
      ["loader context platform", (metadata) => { metadata.context.platform = undefined; }],
      ["loader context architecture", (metadata) => { metadata.context.architecture = undefined; }],
      ["protected host", (metadata) => { metadata.context.protectedHost = undefined; }],
      ["loader context environment", (metadata) => { metadata.context.env = undefined; }],
      ["loader context cwd", (metadata) => { metadata.context.cwd = undefined; }],
      ["loader context nonce", (metadata) => { metadata.context.challengeNonce = undefined; }],
      ["redirect state", (metadata) => { metadata.redirects = undefined; }],
    ];

    for (const [label, mutate] of cases) {
      const metadata = makeMetadata();
      mutate(metadata);
      const fixture = makeDependencies({ metadata });
      const session = createGitSession(fixture.dependencies);
      const result = run(session);

      expectUnsafe(result);
      expect(fixture.spawnSync, label).not.toHaveBeenCalled();
    }
  });
  it.each([
    ["candidate bytes", (fs) => { fs.readFileSync = undefined; }],
    ["native candidate identity", (fs) => {
      const baseStat = fs.statSync;
      fs.statSync = vi.fn((target, options) => {
        const stat = baseStat(target, options);
        removeNativeIdentity(stat);
        return stat;
      });
    }],
  ])("fails closed when the strong executable binding observation is missing: %s", (_label, removeObservation) => {
    const fixture = makeDependencies();
    removeObservation(fixture.dependencies.fs);
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform !== "win32")(
    "generated hook consumer rejects an owned binary replaced after metadata admission before the first Git spawn (Windows-only: pinned Git bytes and hardlink identities are required)",
    (context) => {
      if (!nodeFs.existsSync(WRAPPER_PATH)) {
        context.skip(`requires the pinned Windows Git executable at ${WRAPPER_PATH}`);
        return;
      }
      let owned;
      try {
        owned = createOwnedBinaryReplacement();
      } catch (error) {
        context.skip(`owned Windows binary fixture requires copy and hardlink support: ${error?.code ?? error?.message}`);
        return;
      }
      try {
        if (owned.initial.hash !== OFFICIAL.wrapperSha256) {
          context.skip(`requires Git for Windows ${OFFICIAL.productVersion} bytes at ${WRAPPER_PATH}`);
          return;
        }
        expect(owned.initial.nlink).toBe(2);
        expect(owned.replacement.nlink).toBe(2);
        expect(owned.replacement.hash).not.toBe(owned.initial.hash);
        expect(owned.replacement.identity).not.toEqual(owned.initial.identity);

        const fixture = makeOwnedBinaryDependencies({ owned, replaceOnProbe: true });
        const session = createGeneratedGitSession(fixture.dependencies);
        const result = run(session);

        expectUnsafe(result);
        expect(fixture.query).toHaveBeenCalled();
        expect(fixture.observations[0]).toEqual(expect.objectContaining({
          hash: owned.initial.hash,
          identity: owned.initial.identity,
          bytes: owned.initial.bytes,
        }));
        expect(owned.replaceCount).toBe(1);
        expect(fixture.spawnSync).not.toHaveBeenCalled();
        expect(fixture.spawned).toHaveLength(0);
      } finally {
        owned.cleanup();
      }
    },
  );

  it.skipIf(process.platform !== "win32")(
    "generated hook consumer rejects an owned binary replaced after an admitted call before a later Git spawn (Windows-only: pinned Git bytes and hardlink identities are required)",
    (context) => {
      if (!nodeFs.existsSync(WRAPPER_PATH)) {
        context.skip(`requires the pinned Windows Git executable at ${WRAPPER_PATH}`);
        return;
      }
      let owned;
      try {
        owned = createOwnedBinaryReplacement();
      } catch (error) {
        context.skip(`owned Windows binary fixture requires copy and hardlink support: ${error?.code ?? error?.message}`);
        return;
      }
      try {
        if (owned.initial.hash !== OFFICIAL.wrapperSha256) {
          context.skip(`requires Git for Windows ${OFFICIAL.productVersion} bytes at ${WRAPPER_PATH}`);
          return;
        }
        expect(owned.initial.nlink).toBe(2);
        expect(owned.replacement.nlink).toBe(2);
        expect(owned.replacement.hash).not.toBe(owned.initial.hash);
        expect(owned.replacement.identity).not.toEqual(owned.initial.identity);

        const fixture = makeOwnedBinaryDependencies({ owned });
        const session = createGeneratedGitSession(fixture.dependencies);
        const first = run(session);

        expect(fixture.observations[0]).toEqual(expect.objectContaining({
          hash: owned.initial.hash,
          identity: owned.initial.identity,
          bytes: owned.initial.bytes,
        }));
        expect(first.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
        expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
        expect(fixture.spawned[0].bytes).toEqual(owned.initial.bytes);
        expect(sha256Bytes(fixture.spawned[0].bytes)).toBe(owned.initial.hash);

        owned.replace();
        const later = run(session, ALLOWED_TUPLES[1]);

        expectUnsafe(later);
        expect(fixture.spawnSync).toHaveBeenCalledTimes(1);
        expect(fixture.spawned).toHaveLength(1);
      } finally {
        owned.cleanup();
      }
    },
  );

  it.each([
    ["candidate bytes", (fs) => { fs.readFileSync = undefined; }],
    ["native candidate identity", (fs) => {
      const baseStat = fs.statSync;
      fs.statSync = vi.fn((target, options) => {
        const stat = baseStat(target, options);
        removeNativeIdentity(stat);
        return stat;
      });
    }],
  ])("generated hook consumer fails closed when the strong executable binding observation is missing: %s", (_label, removeObservation) => {
    const fixture = makeDependencies();
    removeObservation(fixture.dependencies.fs);
    const session = createGeneratedGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });



  it.each([
    ["unknown release", (metadata) => { metadata.release.productVersion = "2.53.0.windows.1"; }],
    ["unknown candidate path", (metadata) => { metadata.candidate.path = "C:\\Program Files\\OtherGit\\cmd\\git.exe"; }],
    ["wrapper hash", (metadata) => { metadata.candidate.sha256 = "0".repeat(64); }],
    ["Git hash", (metadata) => { metadata.objects.git.sha256 = "0".repeat(64); }],
    ["certificate", (metadata) => { metadata.candidate.signature.certificateFingerprint = "00:".repeat(31) + "00"; }],
    ["editor", (metadata) => { metadata.candidate.signature.signer = "Impostor"; }],
    ["signature validity", (metadata) => { metadata.candidate.signature.osStatus = "Unknown"; }],
    ["wrapper link count", (metadata) => { metadata.candidate.nlink = 3; }],
    ["identity mismatch", (metadata) => { metadata.objects.wrapperAliases[0].identity.fileId128 = "0x000000000000000000000000000000FF"; }],
    ["numeric identity truncation", (metadata) => { metadata.candidate.identity.fileId128 = Number.parseInt(metadata.candidate.identity.fileId128, 16); }],
    ["reparse point", (metadata) => { metadata.candidate.reparse = true; }],
    ["alternate data stream", (metadata) => { metadata.candidate.ads = true; }],
    ["device candidate", (metadata) => { metadata.candidate.device = true; }],
    ["external alias", (metadata) => { metadata.candidate.aliases.push("C:\\Users\\attacker\\git.exe"); }],
    ["incomplete alias enumeration", (metadata) => { metadata.linkSet.wrapper.pop(); }],
    ["untrusted load closure", (metadata) => { metadata.loader.dependencies[0].protected = false; }],
    ["unknown load closure", (metadata) => { metadata.loader.dependencies.push({ name: "unknown.dll", resolution: "unknown", protected: false }); }],
  ])("rejects %s without trying another executable", (_label, mutate) => {
    const metadata = makeMetadata();
    mutate(metadata);
    const fixture = makeDependencies({ metadata, includeFallback: true });
    const session = createGitSession(fixture.dependencies);
    const result = run(session);

    expectUnsafe(result);
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("stops at the first rejected PATH candidate instead of falling back to a later Git", () => {
    const metadata = makeMetadata();
    metadata.release.productVersion = "unknown-release";
    const fixture = makeDependencies({ metadata, includeFallback: true });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });
  it("does not treat an environment flag or report-shaped value as trust authority", () => {
    const metadata = makeMetadata();
    metadata.release.productVersion = "unknown-release";
    const fixture = makeDependencies({
      metadata,
      env: {
        GIT_TRUST_APPROVED: "true",
        GIT_TRUST_METADATA: JSON.stringify({ approved: true, path: WRAPPER_PATH }),
      },
    });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it.each(["git.cmd", "git.bat"])("rejects %s candidates rather than invoking a shell wrapper", (candidateName) => {
    const metadata = makeMetadata({ candidateName });
    const fixture = makeDependencies({ metadata, candidateName });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("accepts only the independent timestamped certificate decision, not a matching subject alone", () => {
    const accepted = makeDependencies();
    accepted.metadata.candidate.signature.certificateValidTo = "2026-05-05T23:59:59Z";
    accepted.metadata.candidate.signature.timestamped = true;
    const acceptedSession = createGitSession(accepted.dependencies);
    const acceptedResult = run(acceptedSession);
    expect(acceptedResult.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");

    const rejectedMetadata = makeMetadata();
    rejectedMetadata.candidate.signature = {
      valid: true,
      osStatus: "Valid",
      timestamped: false,
      signer: OFFICIAL.signer,
      subject: "C=DE\\nO=Johannes Schindelin\\nCN=Johannes Schindelin",
      certificateFingerprint: "00:00:00",
    };
    const rejected = makeDependencies({ metadata: rejectedMetadata });
    const rejectedSession = createGitSession(rejected.dependencies);
    expectUnsafe(run(rejectedSession));
    expect(rejected.spawnSync).not.toHaveBeenCalled();
  });

  it("distinguishes absent SafeDllSearchMode (default enabled), disabled zero, and registry read error", () => {
    const absent = makeDependencies();
    const absentSession = createGitSession(absent.dependencies);
    const absentResult = run(absentSession);
    expect(absentResult.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");

    for (const state of [{ state: "disabled", value: 0 }, { state: "error", code: "E_REGISTRY_READ" }]) {
      const metadata = makeMetadata();
      metadata.loader.safeDllSearchMode = state;
      const fixture = makeDependencies({ metadata });
      const session = createGitSession(fixture.dependencies);
      expectUnsafe(run(session));
      expect(fixture.spawnSync).not.toHaveBeenCalled();
    }
  });

  it("rejects nonempty GIT_REDIRECT_STDOUT before Git and does not sanitize the caller environment", () => {
    const fixture = makeDependencies({ env: { GIT_REDIRECT_STDOUT: "CONOUT$", GIT_PAGER: "pager-sentinel" } });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
    expect(fixture.dependencies.env.GIT_REDIRECT_STDOUT).toBe("CONOUT$");
  });

  it("rejects case-insensitive GIT_REDIRECT_STDOUT on an extension candidate", () => {
    const fixture = makeDependencies({ env: { git_redirect_stdout: "C:\\work\\captured.txt" } });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("does not reject an unreachable writable PATH/HOME/bin or OPENSSL setting generically", () => {
    const fixture = makeDependencies({
      env: {
        Path: `${FALLBACK_DIR};${CANDIDATE_DIR}`,
        HOME: "C:\\Users\\attacker\\bin",
        GIT_EXEC_PATH: "C:\\Users\\attacker\\bin",
        OPENSSL_CONF: "C:\\Users\\attacker\\openssl.cnf",
        OPENSSL_MODULES: "C:\\Users\\attacker\\modules",
        GIT_REDIRECT_STDOUT: "",
        GIT_PAGER: "pager-sentinel",
      },
    });
    const session = createGitSession(fixture.dependencies);
    const result = run(session);
    expect(result.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
  });

  it.each([
    ["an untrusted SID", "S-1-5-21-fixture-untrusted-owner"],
    ["BUILTIN Account Operators", "S-1-5-32-548"],
  ])("rejects %s as an owner with implicit WRITE_DAC capability", (_label, owner) => {
    const metadata = makeMetadata();
    metadata.objects.git.acl.owner = owner;
    metadata.objects.git.acl.entries = [{
      trustee: owner,
      applies: true,
      inheritOnly: false,
      rights: ["WRITE_DAC"],
    }];
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects BUILTIN Account Operators with numeric FILE_WRITE_DATA mask 0x2", () => {
    const metadata = makeMetadata();
    metadata.candidate.acl.entries.push({
      trustee: "S-1-5-32-548",
      applies: true,
      inheritOnly: false,
      rights: [],
      mask: 0x2,
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a file ACL mask with FILE_WRITE_DATA bit 0x2", () => {
    const metadata = makeMetadata();
    metadata.objects.git.acl.entries.push({
      trustee: "S-1-5-21-other-user",
      applies: true,
      inheritOnly: false,
      rights: [],
      mask: 0x2,
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a file ACL mask with FILE_APPEND_DATA bit 0x4", () => {
    const metadata = makeMetadata();
    metadata.objects.git.acl.entries.push({
      trustee: "S-1-5-21-other-user",
      applies: true,
      inheritOnly: false,
      rights: [],
      mask: 0x4,
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects an indeterminate file ACL access mask", () => {
    const metadata = makeMetadata();
    metadata.objects.git.acl.entries.push({
      trustee: "S-1-5-21-other-user",
      applies: true,
      inheritOnly: false,
      rights: [],
      mask: "unknown",
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("evaluates an other-user WRITE_DAC ACE that applies to the object", () => {
    const metadata = makeMetadata();
    metadata.objects.git.acl.entries.push({
      trustee: "S-1-5-21-other-user",
      applies: false,
      tokenApplies: false,
      objectApplies: true,
      inheritOnly: false,
      rights: ["WRITE_DAC"],
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects duplicate ancestor observations instead of counting rows", () => {
    const metadata = makeMetadata();
    const duplicate = deepClone(metadata.objects.ancestors[0]);
    metadata.objects.ancestors = [duplicate, deepClone(duplicate), deepClone(duplicate)];
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it.each([
    ["mingw64 bin", "C:\\Program Files\\Git\\mingw64\\bin"],
    ["git-core", "C:\\Program Files\\Git\\mingw64\\libexec\\git-core"],
  ])("rejects omitted required parent coverage for $label", (_label, missingPath) => {
    const metadata = makeMetadata();
    metadata.objects.ancestors = metadata.objects.ancestors.filter((row) => row.path !== missingPath);
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects FILE_ADD_SUBDIRECTORY 0x4 on a Git loader parent", () => {
    const metadata = makeMetadata();
    const loaderParent = metadata.objects.ancestors.find((row) => row.path === "C:\\Program Files\\Git\\mingw64\\bin");
    loaderParent.acl.entries.push({
      trustee: "S-1-5-21-other-user",
      applies: true,
      objectApplies: true,
      tokenApplies: false,
      inheritOnly: false,
      rights: ["FILE_ADD_SUBDIRECTORY"],
      mask: 0x4,
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects an empty wrapper alias observation set", () => {
    const metadata = makeMetadata();
    metadata.objects.wrapperAliases = [];
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects duplicated Git alias observations", () => {
    const metadata = makeMetadata();
    metadata.objects.gitAliases = Array.from({ length: 3 }, () => deepClone(metadata.objects.gitAliases[0]));
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a DLL observation whose path disagrees with its relative name", () => {
    const metadata = makeMetadata();
    metadata.objects.dlls[0].path = "C:\\Program Files\\Git\\mingw64\\bin\\not-the-declared-dll.dll";
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a DLL observation without a distinct second hard-link path", () => {
    const metadata = makeMetadata();
    metadata.objects.dlls[0].aliases[1] = metadata.objects.dlls[0].aliases[0];
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects an incomplete thirteen-name loader closure", () => {
    const metadata = makeMetadata();
    metadata.loader.dependencies.pop();
    metadata.loader.enumeration.rowCount = 12;
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects bcrypt classified as a KnownDLL when the effective registry disagrees", () => {
    const metadata = makeMetadata();
    metadata.loader.knownDLLs.push("bcrypt.dll");
    metadata.loader.dependencies.find((item) => item.name === "bcrypt.dll").resolution = "known-dll";
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a system32 resolution when the application-directory predecessor observation is missing", () => {
    const metadata = makeMetadata();
    const bcrypt = metadata.loader.dependencies.find((item) => item.name === "bcrypt.dll");
    bcrypt.resolution = "system32-default";
    metadata.loader.appDirectoryCandidates = undefined;
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a System32 dependency with an unsafe ACL", () => {
    const metadata = makeMetadata();
    const dependency = metadata.loader.dependencies.find((item) => item.name === "bcrypt.dll");
    dependency.acl.entries.push({
      trustee: "S-1-5-21-other-user",
      applies: true,
      inheritOnly: false,
      rights: ["WRITE_DAC"],
      mask: 0x40000,
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a System32 dependency with missing identity metadata", () => {
    const metadata = makeMetadata();
    const dependency = metadata.loader.dependencies.find((item) => item.name === "bcrypt.dll");
    dependency.identity = undefined;
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a System32 dependency marked as a reparse point", () => {
    const metadata = makeMetadata();
    const dependency = metadata.loader.dependencies.find((item) => item.name === "bcrypt.dll");
    dependency.reparse = true;
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects a candidate clone with matching identity but a contradictory hash", () => {
    const metadata = makeMetadata();
    metadata.candidate = deepClone(metadata.objects.wrapper);
    metadata.candidate.sha256 = "0".repeat(64);
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("rejects metadata naming an unprotected PowerShell host", () => {
    const metadata = makeMetadata();
    metadata.context.protectedHost = "C:\\Users\\attacker\\powershell.exe";
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("returns a terminal trust error for malformed metadata and does not fall back", () => {
    const metadata = makeMetadata();
    metadata.objects.wrapperAliases = {};
    const fixture = makeDependencies({ metadata, includeFallback: true });
    const session = createGitSession(fixture.dependencies);

    const invoke = (args) => {
      try {
        return run(session, args);
      } catch (error) {
        return { status: null, error };
      }
    };
    expectUnsafe(invoke(ALLOWED_TUPLES[0]));
    expectUnsafe(invoke(ALLOWED_TUPLES[1]));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it.each(ALLOWED_TUPLES.map((args) => [args]))("admits the exact read-only tuple %j", (args) => {
    const fixture = makeDependencies();
    const session = createGitSession(fixture.dependencies);
    const result = run(session, args);

    expect(result.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
  });

  it.each([
    ["global config option", ["-c", "core.pager=cat", "config", "--local", "--get", "init.defaultBranch"]],
    ["exec path", ["--exec-path", "rev-parse", "--git-dir"]],
    ["directory option", ["-C", REPO_CWD, "rev-parse", "--git-dir"]],
    ["help", ["help", "config"]],
    ["config editor", ["config", "--edit"]],
    ["write operation", ["update-ref", "refs/heads/main", "0".repeat(40)]],
    ["symbolic-ref delete", ["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]],
    ["unbounded ref format", ["for-each-ref", "--format=%(objectname)", "refs/remotes/origin/HEAD"]],
    ["remote URL lookup", ["config", "--local", "--get", "remote.origin.url"]],
    ["remote traversal", ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/../attacker/HEAD"]],
    ["remote extra operand", ["for-each-ref", "--format=%(refname)", "refs/remotes/origin/HEAD", "extra"]],
    ["ref extra operand", ["check-ref-format", "refs/heads/main", "extra"]],
    ["extra operand", ["rev-parse", "--git-dir", "unexpected"]],
    ["network operation", ["fetch", "origin", "main"]],
  ])("rejects %s before executing Git", (_label, args) => {
    const fixture = makeDependencies();
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session, args));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("accepts CREATOR OWNER inherit-only ACEs and unrelated C: creation without a false positive", () => {
    const metadata = makeMetadata();
    for (const row of allRows(metadata)) {
      row.acl.entries.push({
        trustee: "CREATOR OWNER",
        applies: false,
        inheritOnly: true,
        rights: ["GENERIC_ALL"],
      });
    }
    const root = metadata.objects.ancestors.find((row) => row.path === "C:\\");
    root.acl.entries.push({
      trustee: "S-1-5-21-fixture-user",
      applies: false,
      inheritOnly: true,
      rights: ["CREATE_FILES"],
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    const result = run(session);
    expect(result.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
  });

  it("accepts AU FILE_ADD_SUBDIRECTORY 0x4 on the protected C: root", () => {
    const metadata = makeMetadata();
    const root = metadata.objects.ancestors.find((row) => row.path === "C:\\");
    expect(root.acl.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        trustee: "S-1-5-11",
        objectApplies: true,
        mask: 0x4,
        rights: ["FILE_ADD_SUBDIRECTORY"],
      }),
    ]));
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    const result = run(session);
    expect(result.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
  });

  it("rejects an applicable untrusted S-1-5-32-548 FILE_ADD_SUBDIRECTORY 0x4 ACE on the protected C: root", () => {
    const metadata = makeMetadata();
    const root = metadata.objects.ancestors.find((row) => row.path === "C:\\");
    root.acl.entries.push({
      trustee: "S-1-5-32-548",
      applies: true,
      objectApplies: true,
      tokenApplies: false,
      inheritOnly: false,
      rights: ["FILE_ADD_SUBDIRECTORY"],
      mask: 0x4,
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it.each(UNSAFE_RIGHTS)("rejects an applicable %s ACL right", (right) => {
    const metadata = makeMetadata();
    mutateEveryObject(metadata, (row) => {
      row.acl.entries[0].rights.push(right);
    });
    const fixture = makeDependencies({ metadata });
    const session = createGitSession(fixture.dependencies);

    expectUnsafe(run(session));
    expect(fixture.spawnSync).not.toHaveBeenCalled();
  });

  it("preserves the legacy nlink=1 branch without requiring Windows extension metadata", () => {
    const metadata = makeMetadata({ candidateNlink: 1 });
    const fixture = makeDependencies({
      metadata,
      candidateNlink: 1,
      queryWindowsMetadata: vi.fn(() => { throw new Error("legacy nlink=1 must not probe extension metadata"); }),
    });
    const session = createGitSession(fixture.dependencies);

    const result = run(session, ALLOWED_TUPLES[2]);

    expect(result.error?.code).not.toBe("E_UNSAFE_GIT_EXECUTABLE");
    expect(fixture.query).not.toHaveBeenCalled();
  });
});
