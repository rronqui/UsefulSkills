import {test, afterEach, vi} from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readQualityFile} from '../tdd-orchestrator/lib/quality.mjs';

// Metadata-only doubles on ordinary local files. No object is replaced, linked,
// redirected or opened outside this fixture. Both Node stat modes are honored:
// bigint callers receive exact values; ordinary callers receive Number values.
const LOW = 9007199254740992n;
const HIGH = LOW + 1n;
const roots = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, {recursive:true, force:true});
});

function fixture({field='ino', boundary, changed=HIGH, initial=LOW}={}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality-exact-identity-'));
  roots.push(root);
  const ancestor = path.join(root, 'proofs');
  fs.mkdirSync(ancestor);
  const file = path.join(ancestor, 'receipt.txt');
  const bytes = Buffer.from('Ordinary local proof fixture.\n');
  fs.writeFileSync(file, bytes);
  const lstat = fs.lstatSync.bind(fs), fstat = fs.fstatSync.bind(fs);
  let descriptorStats = 0;
  const convert = (value, options) => options?.bigint === true ? value : Number(value);
  const target = boundary === 'ancestor-before-read' ? ancestor : boundary === 'root-after-read' ? root : file;
  const stats = (base, options, replacement) => {
    // Keep every non-target property from Node, including type predicates,
    // exact size/link count and timestamp fields in the requested stat mode.
    const result = Object.create(base);
    Object.assign(result, {dev:convert(field === 'dev' ? initial : 0n, options), ino:convert(initial, options)});
    if (replacement && field.endsWith('Ns')) {
      if (options?.bigint === true) result[field] = base[field] + 1n;
    } else if (replacement) result[field] = convert(changed, options);
    return result;
  };
  vi.spyOn(fs, 'lstatSync').mockImplementation((name, options) => {
    const base = lstat(name, options);
    const resolved = path.resolve(String(name));
    const replace = resolved === target && (
      boundary === 'file-before-open' && descriptorStats >= 1 ||
      boundary === 'ancestor-before-read' && descriptorStats >= 1 ||
      boundary === 'root-after-read' && descriptorStats >= 2
    );
    return stats(base, options, replace);
  });
  vi.spyOn(fs, 'fstatSync').mockImplementation((fd, options) => {
    descriptorStats++;
    const replace = boundary === 'file-before-open' || boundary === 'descriptor-after-read' && descriptorStats >= 2;
    return stats(fstat(fd, options), options, replace);
  });
  const read = vi.spyOn(fs, 'readFileSync');
  const attempt = () => readQualityFile(root, 'proofs/receipt.txt');
  const descriptorReads = () => read.mock.calls.filter(([name]) => typeof name === 'number').length;
  return {attempt, bytes, descriptorReads};
}

function rejected(f, pattern, expectedReads) {
  let error;
  try { f.attempt(); } catch (caught) { error = caught; }
  assert.ok(error, 'readQualityFile must reject distinct exact metadata rather than return fixture bytes');
  assert.match(error.message, pattern, 'rejection must identify this boundary, not setup/type/link-count failure');
  assert.equal(f.descriptorReads(), expectedReads, 'only the authorized descriptor read phase may occur');
}

for (const field of ['ino', 'dev']) test(`AC-002 exact ${field} collision rejected before descriptor bytes`, () => {
  assert.notEqual(LOW, HIGH);
  assert.equal(Number(LOW), Number(HIGH), 'fixture exercises precision collision');
  rejected(fixture({field, boundary:'file-before-open'}), /file identity changed before read/, 0);
});

test('AC-002 exact ancestor inode collision rejected before descriptor bytes', () => {
  rejected(fixture({boundary:'ancestor-before-read'}), /path identity changed/, 0);
});

test('AC-002 exact root device collision rejected in post-read path recheck', () => {
  rejected(fixture({field:'dev', boundary:'root-after-read'}), /path identity changed/, 1);
});

test('AC-002 exact descriptor inode collision rejected after read', () => {
  rejected(fixture({boundary:'descriptor-after-read'}), /file changed during read/, 1);
});

for (const field of ['mtimeNs', 'ctimeNs']) test(`AC-002 ${field} sub-millisecond change rejected after read`, () => {
  // Only nanoseconds differ; original millisecond fields remain unchanged.
  // Numeric stats do not expose these fields, just as in Node itself.
  rejected(fixture({field, boundary:'descriptor-after-read'}), /file changed during read/, 1);
});

for (const [label, initial] of [['high exact identity', HIGH], ['safe identity', 17n]]) test(`AC-002 unchanged ${label} returns the same local bytes`, () => {
  const f = fixture({initial});
  assert.deepEqual(f.attempt(), f.bytes);
  assert.equal(f.descriptorReads(), 1);
});

test('AC-002 unchanged high exact device returns the same local bytes', () => {
  const f = fixture({field:'dev', initial:HIGH});
  assert.deepEqual(f.attempt(), f.bytes);
  assert.equal(f.descriptorReads(), 1);
});

test('AC-002 descriptor multiple-link metadata is rejected with either stat mode', () => {
  rejected(fixture({field:'nlink', boundary:'file-before-open', changed:2n}), /file identity changed before read/, 0);
});
