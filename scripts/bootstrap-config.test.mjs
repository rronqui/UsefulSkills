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
const packageSource = readFileSync(join(repoRoot, "package.json"), "utf8");
const packageJson = JSON.parse(packageSource);
const releaseConfig = JSON.parse(readFileSync(join(repoRoot, "release-please-config.json"), "utf8"));
const releaseManifest = JSON.parse(readFileSync(join(repoRoot, ".release-please-manifest.json"), "utf8"));
const shipConfig = JSON.parse(readFileSync(join(repoRoot, "ship.config.json"), "utf8"));
const shipSkill = readFileSync(join(repoRoot, "ship", "SKILL.md"), "utf8");
const tddSkill = readFileSync(join(repoRoot, "tdd-orchestrator", "SKILL.md"), "utf8");
const bugDiagnosisSkill = readFileSync(join(repoRoot, "bug-diagnosis", "SKILL.md"), "utf8");
const vitestConfig = readFileSync(join(repoRoot, "vitest.config.ts"), "utf8");
const license = readFileSync(join(repoRoot, "LICENSE"), "utf8");
const notice = existsSync(join(repoRoot, "NOTICE"))
  ? readFileSync(join(repoRoot, "NOTICE"), "utf8")
  : "";

function workflowEvents(yaml) {
  const startAt = yaml.search(/^on:\s*$/m);
  expect(startAt, "workflow sem seção on").toBeGreaterThanOrEqual(0);
  const ends = ["concurrency:", "permissions:", "jobs:"]
    .map((marker) => yaml.indexOf(marker, startAt + 3))
    .filter((index) => index >= 0);
  const endAt = ends.length ? Math.min(...ends) : yaml.length;
  return yaml.slice(startAt, endAt);
}

function releaseJobGuard(yaml) {
  const guardAt = yaml.indexOf("if:");
  return guardAt >= 0 ? yaml.slice(guardAt, guardAt + 300) : "";
}

function releaseGuardHasBranchScope(yaml) {
  const guard = releaseJobGuard(yaml);
  return /github\.ref_type\s*==\s*["']branch["']/i.test(guard)
    || /github\.ref\s*==[^\n]*(?:refs\/heads|default_branch)/i.test(guard);
}

function releaseJobHasDefaultGuard(yaml, fixture) {
  const guard = releaseJobGuard(yaml);
  const refMatchesDefaultBranch = !fixture.ref
    || fixture.ref === `refs/heads/${fixture.repository.default_branch}`;
  return fixture.ref_name === fixture.repository.default_branch
    && refMatchesDefaultBranch
    && /github\.ref_name\s*==\s*github\.event\.repository\.default_branch/.test(guard);
}

function workflowJobSection(yaml, jobName) {
  const marker = `  ${jobName}:`;
  const startAt = yaml.indexOf(marker);
  expect(startAt, `job ausente: ${jobName}`).toBeGreaterThanOrEqual(0);
  const nextAt = yaml.slice(startAt + marker.length).search(/\n  [^\s]/);
  return yaml.slice(startAt, nextAt >= 0 ? startAt + marker.length + nextAt : yaml.length);
}
function workflowTriggerKeys(yaml) {
  return workflowEvents(yaml)
    .split(/\r?\n/)
    .map((line) => line.match(/^  ([A-Za-z_][A-Za-z0-9_-]*):(?:\s|$)/)?.[1])
    .filter(Boolean);
}

function jobIfExpression(yaml, jobName) {
  const section = workflowJobSection(yaml, jobName);
  const match = section.match(/^\s*if:\s*(.+)$/m);
  expect(match, `guard ausente: ${jobName}`).not.toBeNull();
  return match[1].trim();
}

function tokenizeGithubExpression(expression) {
  const source = expression
    .replace(/^\s*\$\{\{\s*/, "")
    .replace(/\s*\}\}\s*$/, "");
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    const operator = source.slice(index).match(/^(===|!==|==|!=|&&|\|\|)/)?.[1];
    if (operator) {
      tokens.push({ kind: operator });
      index += operator.length;
      continue;
    }
    if (source[index] === "(" || source[index] === ")") {
      tokens.push({ kind: source[index] });
      index += 1;
      continue;
    }
    if (source[index] === "!") {
      tokens.push({ kind: "!" });
      index += 1;
      continue;
    }
    if (source[index] === "'" || source[index] === "\"") {
      const quote = source[index];
      let end = index + 1;
      let value = "";
      while (end < source.length && source[end] !== quote) {
        if (source[end] === "\\" && end + 1 < source.length) end += 1;
        value += source[end];
        end += 1;
      }
      expect(source[end], "literal de guard não terminado").toBe(quote);
      tokens.push({ kind: "value", value });
      index = end + 1;
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_.]*/)?.[0];
    expect(identifier, `token inesperado no guard: ${source.slice(index)}`).toBeTruthy();
    tokens.push({ kind: "value", value: identifier });
    index += identifier.length;
  }
  return tokens;
}

function evaluateGithubCondition(expression, fixture) {
  const tokens = tokenizeGithubExpression(expression);
  const repository = fixture.event?.repository ?? fixture.repository;
  const values = {
    "github.event_name": fixture.event_name,
    "github.ref_type": fixture.ref_type,
    "github.ref_name": fixture.ref_name,
    "github.ref": fixture.ref,
    "github.event.repository.default_branch": repository.default_branch,
  };
  let cursor = 0;
  const resolve = (value) => Object.hasOwn(values, value) ? values[value] : value;
  const parseValue = () => {
    const token = tokens[cursor];
    expect(token?.kind, "valor ausente no guard").toBe("value");
    cursor += 1;
    return resolve(token.value);
  };
  const parsePrimary = () => {
    if (tokens[cursor]?.kind === "!") {
      cursor += 1;
      return !parsePrimary();
    }
    if (tokens[cursor]?.kind === "(") {
      cursor += 1;
      const value = parseOr();
      expect(tokens[cursor]?.kind, "parêntese não fechado no guard").toBe(")");
      cursor += 1;
      return value;
    }
    const left = parseValue();
    const operator = tokens[cursor]?.kind;
    if (operator !== "==" && operator !== "!=" && operator !== "===" && operator !== "!==") {
      return Boolean(left);
    }
    cursor += 1;
    const right = parseValue();
    return operator === "==" || operator === "==="
      ? left === right
      : left !== right;
  };
  const parseAnd = () => {
    let value = parsePrimary();
    while (tokens[cursor]?.kind === "&&") {
      cursor += 1;
      value = parsePrimary() && value;
    }
    return value;
  };
  function parseOr() {
    let value = parseAnd();
    while (tokens[cursor]?.kind === "||") {
      cursor += 1;
      value = parseAnd() || value;
    }
    return value;
  }
  const result = parseOr();
  expect(cursor, "tokens não consumidos no guard").toBe(tokens.length);
  return Boolean(result);
}

function branchIgnorePatterns(yaml) {
  const lines = workflowEvents(yaml).split(/\r?\n/);
  const patterns = [];
  for (let index = 0; index < lines.length; index += 1) {
    const declaration = lines[index].match(/^(\s*)branches-ignore:\s*(.*?)\s*$/);
    if (!declaration) continue;
    const baseIndent = declaration[1].length;
    const inline = declaration[2];
    if (inline) {
      patterns.push(...inline.replace(/[\[\]"']/g, "").split(",").map((entry) => entry.trim()).filter(Boolean));
    }
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.trim()) continue;
      const indentation = line.match(/^\s*/)[0].length;
      if (indentation <= baseIndent) break;
      const entry = line.match(/^\s*-\s*["']?([^"']+)["']?\s*$/);
      if (entry) patterns.push(entry[1].trim());
    }
  }
  return patterns;
}

function declaresNode20(text) {
  return /(?:Node(?:\.js)?|node-version|["']node["'])[\s\S]{0,100}(?:>=\s*20|\b2[0-9]\b)/i.test(text);
}
function declaresSupportedNode20(text) {
  return text.split(/\r?\n/).some((line) => (
    /(?:Node(?:\.js)?|node-version|["']node["'])/i.test(line)
    && /(?:>=\s*20\b|node-version\s*:\s*(?:2[0-9]|[3-9][0-9])\b)/i.test(line)
  ));
}

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
function rulesetRefTemplate(ruleset) {
  const match = ruleset.match(/conditions\.ref_name\.include\s*:\s*\[\s*["'`]([^"'`]+)["'`]\s*\]/i);
  expect(match, "ruleset sem include de ref").not.toBeNull();
  return match[1];
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
    join(repoRoot, "tdd-orchestrator", "SKILL.md"),
    join(repoRoot, "bug-diagnosis", "SKILL.md"),
  ];
  const sourceFiles = [
    join(repoRoot, "README.md"),
    join(repoRoot, "install.mjs"),
    join(repoRoot, "scripts", "install-hooks.mjs"),
    join(repoRoot, "ship", "bin", "lib.mjs"),
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

  it("AC-027: CI e release-please usam permissões mínimas por workflow/job", () => {
    expect(workflowPaths.length).toBeGreaterThan(0);
    for (const path of workflowPaths) {
      const maps = parsePermissionMaps(workflowText.get(path));
      expect(maps, `${relative(repoRoot, path)} não declara permissions`).not.toHaveLength(0);
      for (const permissions of maps) {
        expect(permissions.__all__, `${relative(repoRoot, path)} usa permissions ampla`).toBeUndefined();
        expect(permissions.actions, `${relative(repoRoot, path)} pede permissão Actions não usada`).toBeUndefined();
        expect(Object.values(permissions), `${relative(repoRoot, path)} usa write-all`)
          .not.toContain("write-all");
        expect(Object.values(permissions), `${relative(repoRoot, path)} usa read-all`)
          .not.toContain("read-all");
      }
    }

    const ciMaps = parsePermissionMaps(workflowText.get(join(workflowDir, "ci.yml")) ?? "");
    expect(ciMaps).not.toHaveLength(0);
    expect(ciMaps.every((permissions) => (
      Object.keys(permissions).length === 1
      && permissions.contents === "read"
    ))).toBe(true);

    const releaseMaps = parsePermissionMaps(workflowText.get(join(workflowDir, "release-please.yml")) ?? "");
    expect(releaseMaps).not.toHaveLength(0);
    const releasePermissionKeys = new Set(["contents", "pull-requests", "issues"]);
    expect(releaseMaps.every((permissions) => (
      Object.keys(permissions).every((key) => releasePermissionKeys.has(key))
      && permissions.contents === "write"
      && permissions["pull-requests"] === "write"
    ))).toBe(true);
    // AC-016 é a fonte normativa para issues: write e o token PAT.
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
  it("AC-016: CI e release usam a branch default descoberta, inclusive fixture não-main", () => {
    const ci = workflowText.get(join(workflowDir, "ci.yml")) ?? "";
    const release = workflowText.get(join(workflowDir, "release-please.yml")) ?? "";
    const nonMainFixture = {
      ref_name: "develop",
      repository: { default_branch: "develop" },
    };

    expect(workflowEvents(ci), "CI não deve congelar a branch no YAML").not.toMatch(/branches\s*:/i);
    expect(workflowEvents(release), "release não deve congelar a branch no YAML").not.toMatch(/branches\s*:/i);
    expect(release).toMatch(/workflow_dispatch/);
    expect(releaseJobHasDefaultGuard(release, nonMainFixture), "release deve executar para a default descoberta, não apenas main").toBe(true);
  });
  it("AC-016: release rejeita tag que reutiliza ref_name da branch default", () => {
    const release = workflowText.get(join(workflowDir, "release-please.yml")) ?? "";
    const branchFixture = {
      ref: "refs/heads/main",
      ref_name: "main",
      ref_type: "branch",
      repository: { default_branch: "main" },
    };
    const sameNameTagFixture = {
      ref: "refs/tags/main",
      ref_name: "main",
      ref_type: "tag",
      repository: { default_branch: "main" },
    };

    expect(releaseGuardHasBranchScope(release), "guard deve distinguir refs/heads de refs/tags").toBe(true);
    expect(releaseJobHasDefaultGuard(release, branchFixture)).toBe(true);
    expect(releaseJobHasDefaultGuard(release, sameNameTagFixture), "tag não pode passar só por repetir ref_name").toBe(false);
  });

  it("AC-016: token do release action é exatamente o secret PAT autorizado", () => {
    const release = workflowText.get(join(workflowDir, "release-please.yml")) ?? "";
    const tokenLines = [...release.matchAll(/^\s+token:\s*(.+)$/gm)].map((match) => match[1].trim());

    expect(tokenLines).toEqual(["${{ secrets.RELEASE_PLEASE_TOKEN }}"]);
  });

  it("AC-016: CI roda PR e push somente na default, sem branches-ignore que a exclua", () => {
    const ci = workflowText.get(join(workflowDir, "ci.yml")) ?? "";
    const quality = workflowJobSection(ci, "quality");
    const ignoredBranches = branchIgnorePatterns(ci);

    expect(quality).toMatch(/if:\s*\$\{\{[\s\S]{0,220}github\.event_name\s*==\s*["']pull_request["']/i);
    expect(quality).toMatch(/github\.ref_name\s*==\s*github\.event\.repository\.default_branch/);
    expect(quality).toMatch(/github\.ref_type\s*==\s*["']branch["']|github\.ref\s*==[^\n]*refs\/heads/i);
    expect(ignoredBranches).not.toContain("main");
    expect(ignoredBranches).not.toContain("**");
  });
  it("AC-016 REVISION: triggers obrigatórios e guards executam apenas a default não-main", () => {
    const ci = workflowText.get(join(workflowDir, "ci.yml")) ?? "";
    const release = workflowText.get(join(workflowDir, "release-please.yml")) ?? "";
    const expectedCiTriggers = ["pull_request", "push"];
    const expectedReleaseTriggers = ["push", "workflow_dispatch"];

    expect(workflowTriggerKeys(ci).toSorted()).toEqual(expectedCiTriggers);
    expect(workflowTriggerKeys(release).toSorted()).toEqual(expectedReleaseTriggers);
    for (const [name, yaml] of [["CI", ci], ["release", release]]) {
      expect(workflowEvents(yaml), `${name} não pode filtrar branch por nome estático`)
        .not.toMatch(/^\s{2,}branches(?:-ignore)?\s*:/im);
    }

    const repository = { default_branch: "develop" };
    const fixture = (overrides = {}) => ({
      event_name: "push",
      ref_type: "branch",
      ref_name: "develop",
      ref: "refs/heads/develop",
      repository,
      ...overrides,
    });
    const ciGuard = jobIfExpression(ci, "quality");
    expect(evaluateGithubCondition(ciGuard, fixture())).toBe(true);
    expect(evaluateGithubCondition(ciGuard, fixture({
      event_name: "pull_request",
      ref_name: "feature/topic",
      ref: "refs/heads/feature/topic",
    }))).toBe(true);
    expect(evaluateGithubCondition(ciGuard, fixture({
      ref_name: "main",
      ref: "refs/heads/main",
    }))).toBe(false);
    expect(evaluateGithubCondition(ciGuard, fixture({
      ref_type: "tag",
      ref: "refs/tags/develop",
    }))).toBe(false);

    const releaseGuard = jobIfExpression(release, "release-please");
    expect(evaluateGithubCondition(releaseGuard, fixture())).toBe(true);
    expect(evaluateGithubCondition(releaseGuard, fixture({
      ref_name: "main",
      ref: "refs/heads/main",
    }))).toBe(false);
    expect(evaluateGithubCondition(releaseGuard, fixture({
      ref_type: "tag",
      ref: "refs/tags/develop",
    }))).toBe(false);
  });

  it("AC-016: release-please usa PAT e somente permissões mínimas, incluindo Issues", () => {
    const release = workflowText.get(join(workflowDir, "release-please.yml")) ?? "";
    const maps = parsePermissionMaps(release);

    expect(release).not.toMatch(/token:\s*\$\{\{[^}\n]*(?:GITHUB_TOKEN|github\.token)/i);
    expect(maps).toHaveLength(1);
    expect(maps[0]).toEqual({
      contents: "write",
      issues: "write",
      "pull-requests": "write",
    });
  });

  it("AC-016: ruleset preserva tipos, contagem e status quality exatos e fecha sem testes", () => {
    const ruleset = sectionBetween(skill, "## FASE 1 — Proteção server-side", "## FASE 2 — CI");
    const strictValues = [...ruleset.matchAll(/strict_required_status_checks_policy\s*[:=]\s*([^\s#`]+)/gi)]
      .map((match) => match[1].replace(/[`"']/g, "").toLowerCase());

    expect(ruleset).toMatch(/required_approving_review_count\s*[:=]\s*0\b/);
    expect(strictValues).toEqual(["true"]);
    expect([...ruleset.matchAll(/context\s*[:=]\s*quality\b/gi)]).toHaveLength(1);
    expect(vitestConfig).toMatch(/passWithNoTests\s*:\s*false\b/);
  });
  it("AC-016 REVISION: ruleset usa refs dinâmicas e escalares tipados sem duplicatas", () => {
    const ruleset = sectionBetween(skill, "## FASE 1 — Proteção server-side", "## FASE 2 — CI");
    const approvalValues = [...ruleset.matchAll(/required_approving_review_count\s*[:=]\s*([^\s,;`)]+)/gi)]
      .map((match) => match[1]);
    const strictValues = [...ruleset.matchAll(/strict_required_status_checks_policy\s*[:=]\s*([^\s,;`)]+)/gi)]
      .map((match) => match[1]);
    const refTemplate = rulesetRefTemplate(ruleset);

    expect(approvalValues).toEqual(["0"]);
    expect(strictValues).toEqual(["true"]);
    expect([...ruleset.matchAll(/context\s*[:=]\s*quality\b/gi)]).toHaveLength(1);
    expect(ruleset).toMatch(/default_branch\s*=\s*\$\(\s*gh api repos\/\{owner\}\/\{repo\}\s+-q\s+\.default_branch\s*\)/);
    expect(refTemplate).toBe("refs/heads/${default_branch}");

    const nonMainRef = refTemplate.replace("${default_branch}", "develop");
    expect(nonMainRef).toBe("refs/heads/develop");
    expect(nonMainRef).not.toBe("refs/heads/main");
    expect(nonMainRef).not.toMatch(/^refs\/tags\//);
    expect("refs/heads/develop").toBe(nonMainRef);
    expect("refs/heads/feature/topic").not.toBe(nonMainRef);
  });

  it("AC-016: auditoria redige tokens antes de persistir e nunca os imprime", () => {
    const security = sectionBetween(skill, "## FASE 0 — Auditoria de segurança", "## FASE 1 — Proteção server-side");

    expect(security).toMatch(/(?:redac\w*|redig\w*|redij\w*)[\s\S]{0,120}<REDACTED>/i);
    expect(security).toMatch(/(?:stdin|StandardInput)/i);
    expect(security).toMatch(/gh secret set RELEASE_PLEASE_TOKEN/);
    expect(security).toMatch(/(?:unset\s+token|\$token\s*=\s*\$null)/i);
    expect(security).not.toMatch(/(?:echo|printf)\s+[^\n]*(?:ghp_|gho_|ghs_|ghr_|github_pat_|eyJ[A-Za-z0-9])/i);
  });

  it("AC-017: README e skills tornam TDD comportamental obrigatório e declaram Bash/AWK do gate HITL", () => {
    const docs = `${readme}\n${skill}\n${shipSkill}\n${tddSkill}\n${bugDiagnosisSkill}`;
    expect(packageJson.engines?.node).toBe(">=20");
    for (const { path, text } of nodeRequirementFiles()) {
      expect(text, `${relative(repoRoot, path)} ainda declara runtime legado`).not.toMatch(/(?:Node|node(?:\.js)?)[^\r\n]{0,40}(?:>=\s*18|v?18(?:\.x)?\b)/i);
    }
    expect(readme).toMatch(/TDD[\s\S]{0,100}(?:obrigat|mandatory|required)/i);
    expect(readme).not.toMatch(/TDD[^\n]{0,120}(?:opcional|optional)/i);
    expect(docs).toMatch(/\bBash\b/i);
    expect(readme).toMatch(/\bAWK\b/i);
    expect(docs).toMatch(/(?:HITL|redact\w*|redig\w*)/i);
  });
  it("AC-017: documentação não envia variáveis de token para stdout/stderr/log", () => {
    const docs = `${readme}\n${skill}\n${shipSkill}\n${tddSkill}\n${bugDiagnosisSkill}`;
    const unsafeTokenOutput = docs.split(/\r?\n/).filter((line) => {
      const outputSink = /\b(?:echo|printf|Write-Host|console\.(?:log|error|warn)|print)\b/i.test(line);
      const tokenReference = /(?:\$[{(]?(?:token|TOKEN|GITHUB_TOKEN|RELEASE_PLEASE_TOKEN)|\b(?:GITHUB|RELEASE)_TOKEN\b|(?:ghp_|gho_|ghs_|ghr_|github_pat_))/i.test(line);
      const safeSecretStdin = /\|\s*gh\s+secret\s+set\s+RELEASE_PLEASE_TOKEN\b/i.test(line);
      return outputSink && tokenReference && !safeSecretStdin;
    });

    expect(unsafeTokenOutput, "docs não podem imprimir variáveis/valores de token").toEqual([]);
  });

  it("AC-017: inventário de runtime cobre fontes Node e declara suporte >=20", () => {
    const inventory = nodeRequirementFiles();
    const inventoryPaths = inventory.map(({ path }) => relative(repoRoot, path).replaceAll("\\", "/"));
    const expectedInventory = [
      "README.md",
      "install.mjs",
      "scripts/install-hooks.mjs",
      "ship/bin/lib.mjs",
      "ship/bin/ship.mjs",
      ".github/workflows/ci.yml",
      ".github/workflows/release-please.yml",
      "release-bootstrap/SKILL.md",
      "ship/SKILL.md",
      "tdd-orchestrator/SKILL.md",
      "bug-diagnosis/SKILL.md",
    ];

    expect(new Set(inventoryPaths).size).toBe(inventoryPaths.length);
    expect(inventoryPaths).toEqual(expect.arrayContaining(expectedInventory));

    const ciPath = join(workflowDir, "ci.yml");
    const runtimeSources = [
      { path: join(repoRoot, "package.json"), text: packageSource },
      { path: join(repoRoot, "install.mjs"), text: installSource },
      { path: join(repoRoot, "README.md"), text: readme },
      { path: join(repoRoot, "release-bootstrap", "SKILL.md"), text: skill },
      { path: join(repoRoot, "ship", "SKILL.md"), text: shipSkill },
      { path: ciPath, text: workflowText.get(ciPath) ?? "" },
    ];
    for (const { path, text } of runtimeSources) {
      expect(declaresNode20(text), `${relative(repoRoot, path)} deve declarar Node >=20`).toBe(true);
    }
  });
  it("AC-017 REVISION: inventário Node completo exige declaração >=20 em cada artefato", () => {
    const inventory = [
      { path: join(repoRoot, "package.json"), text: packageSource },
      ...nodeRequirementFiles(),
    ];
    const expectedInventory = [
      "package.json",
      "README.md",
      "install.mjs",
      "scripts/install-hooks.mjs",
      "ship/bin/lib.mjs",
      "ship/bin/ship.mjs",
      ".github/workflows/ci.yml",
      ".github/workflows/release-please.yml",
      "release-bootstrap/SKILL.md",
      "ship/SKILL.md",
      "tdd-orchestrator/SKILL.md",
      "bug-diagnosis/SKILL.md",
    ];
    const inventoryPaths = inventory.map(({ path }) => relative(repoRoot, path).replaceAll("\\", "/"));

    expect(new Set(inventoryPaths).size).toBe(inventoryPaths.length);
    expect(inventoryPaths.toSorted()).toEqual(expectedInventory.toSorted());
    expect(inventory.every(({ path }) => existsSync(path))).toBe(true);

    const unsupported = inventory
      .filter(({ text }) => !declaresSupportedNode20(text))
      .map(({ path }) => relative(repoRoot, path).replaceAll("\\", "/"));
    expect(unsupported, "cada fonte do inventário deve declarar Node >=20").toEqual([]);
  });

  it("AC-017: NOTICE contém por si só a licença upstream, sem depender de LICENSE", () => {
    const normalizedLicense = license.replace(/\r\n/g, "\n");
    const normalizedNotice = notice.replace(/\r\n/g, "\n");
    const upstreamLicense = normalizedLicense
      .replace(/Copyright \(c\) 2026 rronqui/, "Copyright (c) Matt Pocock")
      .trim();

    expect(normalizedNotice.trim()).not.toBe("");
    expect(normalizedNotice).toContain("https://github.com/mattpocock/skills");
    expect(normalizedNotice).toContain(upstreamLicense);
    expect(normalizedNotice).not.toContain("Copyright (c) 2026 rronqui");
  });

  it("AC-017: LICENSE/NOTICE preservam o notice MIT upstream e docs não contradizem hooks/versionCheck", () => {
    const noticeText = `${license}\n${notice}`;
    const docs = `${readme}\n${skill}\n${shipSkill}`;

    expect(noticeText).toMatch(/github\.com\/mattpocock\/skills/i);
    expect(noticeText).toMatch(/MIT License/i);
    expect(noticeText).toMatch(/Copyright[^\n]*Matt Pocock/i);
    expect(noticeText).toMatch(/Permission is hereby granted/i);
    expect(docs).toMatch(/core\.hooksPath/);
    expect(readme).toMatch(/versionCheckUrl/);
    expect(shipSkill).toMatch(/multi-package[\s\S]{0,180}(?:desabilit|disabled|null|raiz)/i);
  });

});