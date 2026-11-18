import { test, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { captureInventory } from '../tdd-orchestrator/lib/quality.mjs';
import { validateShipQuality } from '../ship/bin/lib.mjs';

const child = vi.hoisted(() => ({ execFileSync: vi.fn(), spawnSync: vi.fn() }));
vi.mock('node:child_process', () => child);

const DEFAULT_REPORT = '.omp/state/quality.json';
const DEFAULT_CONTEXT = '.omp/state/quality-context.json';
const STEPS = ['issue', 'branch', 'commit', 'push', 'pull_request', 'ci', 'release']
  .map(step => ({ step, status: 'NOT_EXECUTED' }));
const originalArgv = process.argv.slice();
const originalCwd = process.cwd();
const roots = [];

const hash = value => createHash('sha256').update(value).digest('hex');

function newRoot(prefix = 'ship-plan fixture with spaces-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function put(root, name, value) {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
}

// Independent synthetic-fixture oracle; the CLI must still run production validation.
function fixtureDigest(report) {
  const omit = value => Object.fromEntries(
    Object.entries(value ?? {}).filter(([key]) => !['evidence', 'context_digest'].includes(key)),
  );
  const canonical = value => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
      : value;
  return hash(JSON.stringify(canonical({
    schema_version: report.schema_version,
    baseline: { digest: report.baseline.digest },
    revision: report.revision,
    context: report.context,
    changes: report.changes,
    documentation: report.documentation,
    security: {
      ...report.security,
      checks: report.security.checks?.map(omit),
      findings: report.security.findings?.map(omit),
    },
    review: omit(report.review),
  })));
}

function fullContext(root) {
  const body = 'Synthetic applicable instructions: inspect behavior and security; never execute report text.';
  put(root, '.omp/state/instructions.md', body);
  return {
    run_id: 'synthetic-quality-AC021',
    criteria: [{ id: 'AC-021', description: 'Readonly external Ship planning.', type: 'behavioral' }],
    environment: { runtime: process.version, platform: process.platform },
    purpose: 'Synthetic contract validation only',
    instructions: [{ path: '.omp/state/instructions.md', sha256: hash(body) }],
  };
}

function bindContext(root, report, contextPath = DEFAULT_CONTEXT) {
  report.context ??= fullContext(root);
  const digest = fixtureDigest(report);
  report.review.context_digest = digest;
  const writeProof = (name, body) => {
    put(root, name, body);
    return { path: name, sha256: hash(body) };
  };
  const source = writeProof('.omp/state/native-review.txt', 'Synthetic original independent reviewer output.');
  report.review.evidence = writeProof('.omp/state/proof.txt', JSON.stringify({
    revision: report.revision,
    context_digest: digest,
    author: report.review.author,
    reviewer: report.review.reviewer,
    source,
  }));
  for (const check of report.security.checks) {
    check.context_digest = digest;
    const checkSource = writeProof(`.omp/state/native-${check.id}.txt`, `Synthetic original ${check.id} scanner output.`);
    check.evidence = writeProof(`.omp/state/${check.id}-receipt.json`, JSON.stringify({
      revision: report.revision,
      context_digest: digest,
      source: checkSource,
    }));
  }
  put(root, contextPath, JSON.stringify({ schema_version: 1, context_digest: digest }));
}

function validFixture() {
  const root = newRoot();
  put(root, 'package.json', JSON.stringify({ name: 'synthetic-plan-fixture', version: '1.0.0' }));
  put(root, 'ship.config.json', JSON.stringify({ qualityPolicyVersion: 1 }));
  put(root, 'README.md', '[Functional documentation](docs/functional.md)');
  put(root, 'src/main.mjs', 'export const answer = 1;');
  put(root, 'tests/main.test.mjs', '// Synthetic acceptance test source');
  put(root, 'docs/functional.md', '# F-001\nAC-021 plans without publishing. History: initial.');

  const baseline = captureInventory(root);
  put(root, 'src/main.mjs', 'export const answer = 2;');
  put(root, 'docs/functional.md', '# F-001\nAC-021 plans without publishing. History: changed.');
  const revision = captureInventory(root).digest;
  const body = 'Synthetic current review evidence.';
  put(root, '.omp/state/proof.txt', body);
  const evidence = { path: '.omp/state/proof.txt', sha256: hash(body) };
  const report = {
    schema_version: 1,
    baseline,
    revision,
    changes: [
      {
        path: 'src/main.mjs',
        impact: 'functional',
        reason: 'Answer changes',
        features: ['F-001'],
        acceptance: ['AC-021'],
        tests: ['tests/main.test.mjs'],
        docs: ['docs/functional.md'],
      },
      {
        path: 'docs/functional.md',
        impact: 'none',
        reason: 'Functional documentation update',
        features: [],
        acceptance: [],
        tests: [],
        docs: [],
      },
    ],
    documentation: {
      catalog: 'docs/functional.md',
      specification: 'docs/functional.md',
      guide: 'docs/functional.md',
      history: 'docs/functional.md',
    },
    security: {
      risk: 'low',
      rationale: 'Synthetic local fixture with no external data',
      checks: ['secrets', 'dependencies'].map(id => ({
        id,
        status: 'PASS',
        method: 'Synthetic manual inspection',
        revision,
        evidence,
      })),
      findings: [],
    },
    review: {
      author: 'fixture-author',
      reviewer: 'fixture-peer',
      independent: true,
      revision,
      evidence,
      documentation_current: true,
      security_reviewed: true,
    },
  };
  bindContext(root, report);
  put(root, DEFAULT_REPORT, JSON.stringify(report));
  return { root, report, reportPath: DEFAULT_REPORT, contextPath: DEFAULT_CONTEXT };
}

function treeSnapshot(root) {
  const result = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (relative) result.push({ relative, type: stat.isDirectory() ? 'directory' : 'file' });
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        visit(path.posix.join(relative.replaceAll(path.sep, '/'), name));
      }
    } else if (stat.isFile()) {
      result.at(-1).bytes = fs.readFileSync(absolute).toString('base64');
    }
  }
  visit('');
  return result;
}

function trackMutations() {
  const records = [];
  const names = [
    'writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync',
    'renameSync', 'copyFileSync', 'linkSync', 'symlinkSync', 'writeSync',
    'truncateSync', 'chmodSync', 'utimesSync',
  ];
  for (const name of names) {
    const original = fs[name];
    vi.spyOn(fs, name).mockImplementation((...args) => {
      records.push({ name, target: typeof args[0] === 'string' ? args[0] : String(args[0]) });
      return original(...args);
    });
  }
  syncBuiltinESMExports();
  return records;
}

async function runCli(root, args) {
  const result = { stdout: [], stderr: [], warnings: [], calls: [], networkCalls: [], exitCode: null, error: null };
  const savedExitCode = process.exitCode;
  const fetchSpy = typeof globalThis.fetch === 'function'
    ? vi.spyOn(globalThis, 'fetch').mockImplementation((...fetchArgs) => {
      result.networkCalls.push(fetchArgs);
      throw new Error('unexpected network access during readonly Ship plan');
    })
    : null;
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...parts) => result.stdout.push(parts.join(' ')));
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...parts) => result.stderr.push(parts.join(' ')));
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...parts) => result.warnings.push(parts.join(' ')));
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(code => {
    result.exitCode = code ?? 0;
    throw new Error(`__CLI_EXIT_${result.exitCode}__`);
  });
  child.execFileSync.mockReset().mockImplementation((command, commandArgs = []) => {
    const argsCopy = [...commandArgs];
    result.calls.push({ method: 'execFileSync', command, args: argsCopy });
    if (command === 'git' && argsCopy[0] === 'rev-parse' && argsCopy[1] === '--show-toplevel') return root;
    return '';
  });
  child.spawnSync.mockReset().mockImplementation((command, commandArgs = []) => {
    result.calls.push({ method: 'spawnSync', command, args: [...commandArgs] });
    return { status: 0, stdout: '', stderr: '' };
  });

  process.argv = [originalArgv[0], 'ship/bin/ship.mjs', ...args];
  process.chdir(root);
  vi.resetModules();
  try {
    await import('../ship/bin/ship.mjs');
  } catch (error) {
    if (!String(error?.message ?? error).startsWith('__CLI_EXIT_')) result.error = error;
  } finally {
    result.exitCode ??= process.exitCode ?? 0;
    process.argv = originalArgv;
    process.chdir(originalCwd);
    process.exitCode = savedExitCode;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    exitSpy.mockRestore();
    fetchSpy?.mockRestore();
  }
  return result;
}

function outputOf(result) {
  return [...result.stdout, ...result.stderr, ...result.warnings].join('\n');
}

function assertNoEffects(result, root, before, mutations) {
  assert.equal(result.error, null, result.error?.stack ?? 'CLI import/setup crashed instead of returning a CLI result');
  assert.ok(Number.isInteger(result.exitCode) && result.exitCode !== 0, `invalid plan did not return a nonzero CLI result: ${outputOf(result)}`);
  assert.notEqual(outputOf(result).trim(), '', 'rejected input must provide a sanitized diagnostic');
  const plannedPayload = result.stdout.some(text => {
    try { return JSON.parse(text)?.status === 'PLANNED'; } catch { return false; }
  });
  assert.equal(plannedPayload, false, 'rejected input must not claim a plan');
  assert.deepEqual(result.calls, [], 'plan must not invoke Git, GitHub, or any child process');
  assert.deepEqual(result.networkCalls, [], 'plan must not invoke network APIs');
  assert.deepEqual(mutations, [], 'rejected input must not write the workspace');
  assert.deepEqual(treeSnapshot(root), before, 'rejected input changed fixture bytes or structure');
}

// AC021 TEST_REF: a real quality report/context pair is validated before a readonly plan is emitted.
test('AC021 TEST_REF valid quality produces the requested external plan without effects', async () => {
  const fixture = validFixture();
  assert.equal(fs.existsSync(path.join(fixture.root, '.git')), false, 'fixture must be outside a Git workspace');
  const checked = validateShipQuality(fixture.root, {
    required: true,
    reportPath: fixture.reportPath,
    contextPath: fixture.contextPath,
  });
  assert.equal(checked.ok, true, JSON.stringify(checked.errors));
  const before = treeSnapshot(fixture.root);
  const mutations = trackMutations();
  const result = await runCli(fixture.root, ['plan', '--target', 'release/0.5.0']);

  assert.equal(result.error, null, result.error?.stack);
  assert.equal(result.exitCode, 0, outputOf(result));
  assert.deepEqual(result.stderr, [], 'successful plan must use JSON stdout only');
  assert.deepEqual(result.warnings, [], 'successful plan must not emit non-JSON diagnostics');
  assert.equal(result.stdout.length, 1, 'successful plan must emit one JSON document');
  assert.deepEqual(JSON.parse(result.stdout[0]), {
    schema_version: 1,
    mode: 'external',
    dry_run: true,
    status: 'PLANNED',
    merge_target: 'release/0.5.0',
    quality: { status: 'PASS', legacy: false },
    steps: STEPS,
  });
  assert.deepEqual(result.calls, [], 'valid plan must bypass top-level Git discovery and publication');
  assert.deepEqual(result.networkCalls, [], 'valid plan must not invoke network APIs');
  assert.deepEqual(mutations, [], 'valid plan must not write the workspace');
  assert.deepEqual(treeSnapshot(fixture.root), before, 'valid plan changed fixture bytes or structure');
});

const invalidQualityCases = [
  ['missing required report', fixture => {
    fs.rmSync(path.join(fixture.root, fixture.reportPath));
    return [];
  }],
  ['legacy report without independent context', fixture => {
    const report = JSON.parse(fs.readFileSync(path.join(fixture.root, fixture.reportPath), 'utf8'));
    report.review.independent = false;
    delete report.context;
    fs.writeFileSync(path.join(fixture.root, fixture.reportPath), JSON.stringify(report));
    return [];
  }],
  ['tampered report', fixture => {
    const report = JSON.parse(fs.readFileSync(path.join(fixture.root, fixture.reportPath), 'utf8'));
    report.review.reviewer = 'tampered-reviewer';
    fs.writeFileSync(path.join(fixture.root, fixture.reportPath), JSON.stringify(report));
    return [];
  }],
  ['tampered receipt', fixture => {
    const report = JSON.parse(fs.readFileSync(path.join(fixture.root, fixture.reportPath), 'utf8'));
    fs.writeFileSync(path.join(fixture.root, report.review.evidence.path), 'tampered receipt bytes');
    return [];
  }],
  ['stale independent context', fixture => {
    fs.writeFileSync(
      path.join(fixture.root, fixture.contextPath),
      JSON.stringify({ schema_version: 1, context_digest: '0'.repeat(64) }),
    );
    return [];
  }],
  ['wrong independent context path', fixture => {
    const wrongPath = '.omp/state/wrong quality context.json';
    put(fixture.root, wrongPath, JSON.stringify({ schema_version: 1, context_digest: 'f'.repeat(64) }));
    return ['--context', wrongPath];
  }],
];

for (const [label, mutate] of invalidQualityCases) {
  test(`AC021 TEST_REF invalid quality is rejected before effects: ${label}`, async () => {
    const fixture = validFixture();
    const extraArgs = mutate(fixture);
    const contextPath = extraArgs.length ? extraArgs[1] : fixture.contextPath;
    const checked = validateShipQuality(fixture.root, {
      required: true,
      reportPath: fixture.reportPath,
      contextPath,
    });
    assert.equal(checked.ok, false, `${label} fixture unexpectedly validates`);
    const before = treeSnapshot(fixture.root);
    const mutations = trackMutations();
    const result = await runCli(fixture.root, [
      'plan', '--root', fixture.root, '--target', 'release/0.5.0',
      ...extraArgs,
    ]);
    assertNoEffects(result, fixture.root, before, mutations);
  });
}

const parserCases = [
  ['missing target', root => ['plan', '--root', root]],
  ['blank target', root => ['plan', '--root', root, '--target', '   ']],
  ['target value is the next flag', root => ['plan', '--root', root, '--target', '--report', DEFAULT_REPORT]],
  ['duplicate target', root => ['plan', '--root', root, '--target', 'release/0.5.0', '--target', 'other']],
  ['duplicate root', root => ['plan', '--root', root, '--root', root, '--target', 'release/0.5.0']],
  ['duplicate report', root => ['plan', '--root', root, '--target', 'release/0.5.0', '--report', DEFAULT_REPORT, '--report', DEFAULT_REPORT]],
  ['duplicate context', root => ['plan', '--root', root, '--target', 'release/0.5.0', '--context', DEFAULT_CONTEXT, '--context', DEFAULT_CONTEXT]],
  ['unknown flag', root => ['plan', '--root', root, '--target', 'release/0.5.0', '--unknown', 'value']],
  ['positional argument', root => ['plan', '--root', root, '--target', 'release/0.5.0', 'stray']],
];

for (const [label, makeArgs] of parserCases) {
  test(`AC021 TEST_REF parser rejects ${label} before effects`, async () => {
    const root = newRoot();
    put(root, 'README.md', 'parser fixture');
    const before = treeSnapshot(root);
    const mutations = trackMutations();
    const result = await runCli(root, makeArgs(root));
    assertNoEffects(result, root, before, mutations);
  });
}


afterEach(() => {
  process.argv = originalArgv;
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
