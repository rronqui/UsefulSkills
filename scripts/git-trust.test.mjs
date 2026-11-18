import { describe, expect, it, vi } from "vitest";
import * as crypto from "node:crypto";
import * as os from "node:os";
import path from "node:path";
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

// Parent identities are deterministic fixture values, not native observations.

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

const WRAPPER_PATH = "C:\\Program Files\\Git\\cmd\\git.exe";
const CANDIDATE_DIR = "C:\\Program Files\\Git\\cmd";
const FALLBACK_DIR = "C:\\Users\\attacker\\bin";
const REPO_CWD = "C:\\work\\UsefulSkills";
const WINDOWS_ROOT = "C:\\Windows";
const POWERSHELL = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

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

function fileRow({ relative, absolutePath, sha256, nlink = 1, fileId128, signature = null, aliases = [] }) {
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
      volume: "0x000000008CAB0001",
      fileId128: fileId128 ?? `0x${(relative.length + 100).toString(16).padStart(32, "0")}`,
    },
    aliases: aliases.length > 0 ? [...aliases] : [absolutePath],
    ancestors: safeAncestors(),
    acl: safeAcl(),
    signature,
  };
}

function makeMetadata({ candidateName = "git.exe", candidateNlink = 2 } = {}) {
  const candidatePath = path.win32.join(CANDIDATE_DIR, candidateName);
  const wrapper = fileRow({
    relative: `cmd/${candidateName}`,
    absolutePath: candidatePath,
    sha256: OFFICIAL.wrapperSha256,
    nlink: candidateNlink,
    fileId128: "0x0000000000000000000200000003E019",
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
    sha256: OFFICIAL.wrapperSha256,
    nlink: 2,
    fileId128: wrapper.identity.fileId128,
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
  const entries = new Map([[candidate, { nlink: candidateNlink, type: "file", symlink: false }]]);
  if (includeFallback) {
    entries.set(path.win32.join(FALLBACK_DIR, "git.exe"), { nlink: 1, type: "file", symlink: false });
  }
  const lstatSync = vi.fn((target) => {
    const row = entries.get(String(target));
    if (!row) {
      const error = new Error(`ENOENT: ${target}`);
      error.code = "ENOENT";
      throw error;
    }
    return {
      isFile: () => row.type === "file",
      isDirectory: () => row.type === "directory",
      isSymbolicLink: () => row.symlink,
      nlink: row.nlink,
    };
  });
  return {
    lstatSync,
    statSync: lstatSync,
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

describe("AC-008 Git admission session", () => {

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
