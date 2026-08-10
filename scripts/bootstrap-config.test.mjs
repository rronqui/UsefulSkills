// Validator estático do bootstrap: regras do GitHub, permissões CI,
// segurança, versão/monorepo e requisitos de runtime.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillPath = join(repoRoot, "release-bootstrap", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");
const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const installSource = readFileSync(join(repoRoot, "install.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const releaseConfig = JSON.parse(readFileSync(join(repoRoot, "release-please-config.json"), "utf8"));
const releaseManifest = JSON.parse(readFileSync(join(repoRoot, ".release-please-manifest.json"), "utf8"));
const shipConfig = JSON.parse(readFileSync(join(repoRoot, "ship.config.json"), "utf8"));

const workflowDir = join(repoRoot, ".github", "workflows");
const workflowPaths = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .map((name) => join(workflowDir, name));
const workflowText = new Map(workflowPaths.map((path) => [path, readFileSync(path, "utf8")]));

function sectionBetween(text, start, end) {
  const startAt = text.indexOf(start);
  expect(startAt, `seção ausente: ${start}`).toBeGreaterThanOrEqual(0);
  const endAt = end ? text.indexOf(end, startAt + start.length) : text.length;
  expect(endAt, `seção seguinte ausente: ${end}`).toBeGreaterThan(startAt);
  return text.slice(startAt, endAt);
}

function parsePermissionMaps(yaml) {
  const lines = yaml.split(/\r?\n/);
  const maps = [];
  for (let index = 0; index < lines.length; index += 1) {
    const declaration = lines[index].match(/^(\s*)permissions:\s*(.*?)\s*$/);
    if (!declaration) continue;

    const baseIndent = declaration[1].length;
    const inline = declaration[2];
    const permissions = {};
    if (inline && /^\{.*\}$/.test(inline)) {
      for (const entry of inline.slice(1, -1).split(",")) {
        const match = entry.trim().match(/^([A-Za-z0-9_-]+)\s*:\s*([A-Za-z0-9_-]+)$/);
        if (match) permissions[match[1]] = match[2];
      }
    } else if (inline) {
      permissions.__all__ = inline;
    }

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.trim() || line.trimStart().startsWith("#")) continue;
      const indentation = line.match(/^\s*/)[0].length;
      if (indentation <= baseIndent) break;
      const entry = line.match(/^\s+([A-Za-z0-9_-]+):\s*([^#\s]+)\s*(?:#.*)?$/);
      if (entry) permissions[entry[1]] = entry[2];
    }
    maps.push(permissions);
  }
  return maps;
}

function semverParts(value) {
  const match = typeof value === "string" && value.match(/^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function compareSemver(left, right) {
  const a = semverParts(left);
  const b = semverParts(right);
  expect(a, `SemVer inválido: ${left}`).not.toBeNull();
  expect(b, `SemVer inválido: ${right}`).not.toBeNull();
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function packagePathForUnit(unit) {
  return unit === "." ? join(repoRoot, "package.json") : join(repoRoot, unit, "package.json");
}

function nodeRequirementFiles() {
  const skillFiles = [
    join(repoRoot, "release-bootstrap", "SKILL.md"),
    join(repoRoot, "ship", "SKILL.md"),
  ];
  const sourceFiles = [
    join(repoRoot, "README.md"),
    join(repoRoot, "install.mjs"),
    join(repoRoot, "ship", "bin", "ship.mjs"),
    ...workflowPaths,
    ...skillFiles,
  ];
  return sourceFiles.map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

describe("bootstrap/release static contract", () => {
  it("AC-003: documenta retry idempotente do corpo do PR sem perder markers de major", () => {
    const policy = `${skill}\n${readme}`;

    expect(policy).toMatch(/Closes #N/);
    expect(policy).toMatch(/(?:exactly one|one and only one|exatamente um|um único)[^\n]{0,100}Closes #N/i);
    expect(policy).toMatch(/(?:preserv\w*|preserve\w*)[^\n]{0,160}(?:published body|already published text|corpo(?: já)? publicado|texto(?: já)? publicado|corpo do PR)/i);
    expect(policy).toMatch(/(?:não|nao|not)[^\n]{0,100}(?:duplic\w*|duplicate)[^\n]{0,100}(?:marker|marcador|Closes)/i);
    expect(policy).toMatch(/BREAKING CHANGE:/);
    expect(policy).toMatch(/(?:`!`|!)[^\n]{0,100}(?:major|breaking)/i);
  });

  it("AC-024: todos os artefatos declaram Node 20+ e o instalador faz preflight fail-fast", () => {
    expect(packageJson.engines?.node).toBe(">=20");

    const legacyRequirement = /(?:Node|node(?:\.js)?)[^\r\n]{0,40}(?:>=\s*18|v?18(?:\.x)?\b)/i;
    for (const { path, text } of nodeRequirementFiles()) {
      expect(text, `${relative(repoRoot, path)} ainda declara runtime legado`).not.toMatch(legacyRequirement);
    }

    expect(installSource).toMatch(/process\.versions\.node/);
    expect(installSource).toMatch(/(?:E_UNSUPPORTED_NODE|Node[^\r\n]{0,80}20)/i);
    expect(installSource).toMatch(/(?:throw|process\.exit)[^\r\n]{0,120}(?:Node|E_UNSUPPORTED_NODE)/i);
  });

  it("AC-026: ruleset é branch-scoped, ativo, verificável e exige status quality estrito booleano", () => {
    const ruleset = sectionBetween(skill, "## FASE 1 — Proteção server-side", "## FASE 2 — CI");
    const ci = workflowText.get(join(workflowDir, "ci.yml")) ?? "";

    expect(ruleset).toMatch(/(?:target|alvo)[\s\S]{0,100}\bbranch\b/i);
    expect(ruleset).toMatch(/enforcement[\s:=`"']{0,20}active/i);
    expect(ruleset).toMatch(/(?:include|ref(?:spec|_name)?|escopo)[\s\S]{0,120}refs\/heads\/(?:main|\$\{[^}]+\})/i);
    expect(ruleset).toMatch(/(?:include|ref(?:spec|_name)?)[\s\S]{0,200}(?:exclude|fora do escopo|no tags?|tags?)/i);
    expect(ruleset).toMatch(/deletion/);
    expect(ruleset).toMatch(/non_fast_forward/);
    expect(ruleset).toMatch(/pull_request/);
    expect(ruleset).toMatch(/required_status_checks/);
    expect(ruleset).toMatch(/strict_required_status_checks_policy\s*[:=]\s*(?:true|false)\b/i);
    expect(ruleset).toMatch(/(?:context|status)[\s:=`"']{0,40}quality\b/i);
    expect(ci).toMatch(/jobs:\s*[\s\S]{0,120}\bquality\s*:/);
    expect(ruleset).toMatch(/(?:GET|verific\w*|consulta\w*)[\s\S]{0,160}(?:ruleset|status)/i);
    expect(ruleset).toMatch(/(?:privad\w*|private)[\s\S]{0,140}(?:plano\s+free|free|server-side|enforcement)/i);
  });

  it("AC-027: cada workflow usa apenas permissões declaradas e mínimas", () => {
    expect(workflowPaths.length).toBeGreaterThan(0);
    for (const path of workflowPaths) {
      const maps = parsePermissionMaps(workflowText.get(path));
      expect(maps, `${relative(repoRoot, path)} não declara permissions`).not.toHaveLength(0);
      for (const permissions of maps) {
        expect(permissions.__all__, `${relative(repoRoot, path)} usa permissions ampla`).toBeUndefined();
        expect(permissions.actions, `${relative(repoRoot, path)} pede permissão Actions não usada`).toBeUndefined();
        expect(Object.values(permissions), `${relative(repoRoot, path)} usa write-all/read-all`).not.toContain("write-all");
        expect(Object.values(permissions), `${relative(repoRoot, path)} usa read-all`).not.toContain("read-all");
      }
    }

    const ciMaps = parsePermissionMaps(workflowText.get(join(workflowDir, "ci.yml")) ?? "");
    expect(ciMaps.some((permissions) => permissions.contents === "read")).toBe(true);
    expect(ciMaps.every((permissions) => Object.keys(permissions).every((key) => key === "contents"))).toBe(true);

    const releaseMaps = parsePermissionMaps(workflowText.get(join(workflowDir, "release-please.yml")) ?? "");
    expect(releaseMaps.some((permissions) => (
      permissions.contents === "write" && permissions["pull-requests"] === "write"
    ))).toBe(true);
    expect(releaseMaps.every((permissions) => Object.keys(permissions).every((key) => ["contents", "pull-requests"].includes(key)))).toBe(true);
  });

  it("AC-028: scanner cobre prefixes modernos/legados, histórico e redaction por stdin", () => {
    const security = sectionBetween(skill, "## FASE 0 — Auditoria de segurança", "## FASE 1 — Proteção server-side");
    for (const prefix of ["ghp_", "gho_", "ghs_", "ghr_", "github_pat_"]) {
      expect(security, `prefixo ausente: ${prefix}`).toContain(prefix);
    }
    for (const signature of ["eyJ", "sk-", "AKIA", "AIza", "xox[bp]-", "-----BEGIN"]) {
      expect(security, `assinatura ausente: ${signature}`).toContain(signature);
    }

    expect(security).toMatch(/git ls-files/);
    expect(security).toMatch(/(?:hist[oó]rico|history|git\s+log)/i);
    expect(security).toMatch(/(?:redac\w*|redig\w*|sem expor|não imprime|nao imprime)/i);
    expect(security).toMatch(/(?:bloque\w*|block\w*)[\s\S]{0,100}(?:publica\w*|publish\w*)/i);
    expect(security).toMatch(/(?:stdin|StandardInput)/i);
    expect(security).toMatch(/gh secret set RELEASE_PLEASE_TOKEN/);
    expect(security).toMatch(/(?:unset\s+token|\$token\s*=\s*\$null)/i);
    expect(security).not.toMatch(/(?:echo|printf)\s+[^\n|]*github_pat_[A-Za-z0-9]/i);
  });

  it("AC-029: release-please e ship compartilham fonte SemVer e monorepo falha cedo", () => {
    const packages = releaseConfig.packages;
    expect(packages && typeof packages).toBe("object");
    const units = Object.keys(packages);
    expect(units.length).toBeGreaterThan(0);
    expect(Object.keys(releaseManifest).sort()).toEqual([...units].sort());

    for (const unit of units) {
      const config = packages[unit];
      expect(config["release-as"], `${unit} congela o release com release-as`).toBeUndefined();
      expect(config["release-type"], `${unit} sem strategy release-please`).toBe("node");
      expect(config["include-component-in-tag"], `${unit} deve usar tag sem componente`).toBe(false);
      expect(semverParts(config["initial-version"]), `${unit} sem initial-version SemVer`).not.toBeNull();
      expect(semverParts(releaseManifest[unit]), `${unit} sem versão no manifest`).not.toBeNull();
      expect(compareSemver(releaseManifest[unit], config["initial-version"])).toBeGreaterThanOrEqual(0);

      const packagePath = packagePathForUnit(unit);
      expect(existsSync(packagePath), `fonte package.json ausente para ${unit}`).toBe(true);
      const unitPackage = JSON.parse(readFileSync(packagePath, "utf8"));
      expect(unitPackage.version, `manifesto/manifest divergentes para ${unit}`).toBe(releaseManifest[unit]);
    }

    if (shipConfig.versionCheckUrl !== null) {
      expect(units, "versionCheckUrl raiz não pode mascarar unidades de monorepo").toHaveLength(1);
      expect(units[0]).toBe(".");
    }

    const releaseSection = sectionBetween(skill, "## FASE 3 — release-please", "## FASE 4 — Validação local");
    expect(releaseSection).toMatch(/monorepo/i);
    expect(releaseSection).toMatch(/packages/);
    expect(releaseSection).toMatch(/versionCheckUrl/);
    expect(releaseSection).toMatch(/(?:fail-fast|falha(?:r)?\s+(?:cedo|explicitamente)|E_VERSION_SOURCE)/i);
    expect(releaseSection).toMatch(/(?:cada|each)[\s\S]{0,120}(?:unidade|unit|package)[\s\S]{0,120}(?:fonte|source)[\s\S]{0,120}(?:resolver|resolv)/i);
  });
});
