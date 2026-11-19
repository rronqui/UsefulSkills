import {test, afterEach} from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Synthetic projects and proofs: no fixture claims real security or reviewer work.
let api = {};
try { api = await import('../tdd-orchestrator/lib/quality.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const capture = api.captureInventory ?? (() => ({files:{}, digest:''}));
// Frozen setup approval, never recomputed during validation.
const validate = (root,report,options={}) => api.validateQuality(root,report,{expectedContextDigest:approved.get(report),...options});
const contextDigest = report => fixtureDigest(report);
const roots = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, {recursive:true, force:true}); });
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const newRoot = () => { const root=fs.mkdtempSync(path.join(os.tmpdir(),'useful-quality-')); roots.push(root); return root; };
function put(root, name, value) { const target=path.join(root,name); fs.mkdirSync(path.dirname(target),{recursive:true}); fs.writeFileSync(target,value); }
function proof(root, name, body='Synthetic fixture evidence, inspected by peer.') { put(root,name,body); return {path:name,sha256:sha(body)}; }
const approved=new WeakMap();
// Independent synthetic-fixture oracle. Production export is asserted separately.
function fixtureDigest(report) {
 const omit=v=>Object.fromEntries(Object.entries(v??{}).filter(([k])=>!['evidence','context_digest'].includes(k)));
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return sha(JSON.stringify(canonical({schema_version:report.schema_version,baseline:{digest:report.baseline.digest},revision:report.revision,context:report.context,changes:report.changes,documentation:report.documentation,security:{...report.security,checks:report.security.checks?.map(omit),findings:report.security.findings?.map(omit)},review:omit(report.review)})));
}
function fullContext(root) {
 const body='Synthetic applicable instructions: inspect behavior and security; never execute report text.';
 put(root,'.omp/state/instructions.md',body);
 return {run_id:'synthetic-quality-T002',criteria:[{id:'AC-001',description:'Answer returns the specified value.',type:'behavioral'}],environment:{runtime:process.version,platform:process.platform},purpose:'Synthetic contract validation only',instructions:[{path:'.omp/state/instructions.md',sha256:sha(body)}]};
}

function bindContext(root,report,{approve=true}={}) {
 report.context??=fullContext(root);
 const digest=contextDigest(report);report.review.context_digest=digest;
 const writeProof=(name,body)=>{put(root,name,body);return {path:name,sha256:sha(body)};};
 const source=writeProof('.omp/state/native-review.txt','Synthetic original independent reviewer output.');
 report.review.evidence=writeProof('.omp/state/review.txt',JSON.stringify({revision:report.revision,context_digest:digest,author:report.review.author,reviewer:report.review.reviewer,source}));
 for(const check of report.security.checks){check.context_digest=digest;const source=writeProof(`.omp/state/native-${check.id}.txt`,`Synthetic original ${check.id} scanner output.`);check.evidence=writeProof(`.omp/state/${check.id}-receipt.json`,JSON.stringify({revision:report.revision,context_digest:digest,source}));}
 if(approve){approved.set(report,digest);put(root,'.omp/state/quality-context.json',JSON.stringify({schema_version:1,context_digest:digest}));}
}
const pass = result => assert.equal(result.ok,true,JSON.stringify(result.errors));
const fail = result => { assert.equal(result.ok,false); assert.ok(Array.isArray(result.errors)&&result.errors.length>0,'diagnostic errors required'); };
const roles = ['catalog','specification','guide','history'];
async function fixture() {
 const root=newRoot();
 put(root,'src/main.mjs','export const answer = 1;\n');
 put(root,'tests/main.test.mjs','// Synthetic acceptance test source\n');
 put(root,'docs/functional guide.md','# Features\n\nF-001 answers one. AC-001: returns one. Usage: call answer.\nHistory: initial fixture.\n');
 put(root,'README.md',roles.map(role=>`- [${role}](docs/functional%20guide.md)`).join('\n'));
 const baseline=await capture(root);
 put(root,'src/main.mjs','export const answer = 2;\n');
 put(root,'docs/functional guide.md','# Features\n\nF-001 answers two. AC-001: returns two. Usage: call answer.\nHistory: answer changed from one to two.\n');
 const current=await capture(root);
 const evidence=proof(root,'.omp/state/review.txt');
 const report={schema_version:1,baseline,revision:current.digest,
  changes:[{path:'src/main.mjs',impact:'functional',reason:'Answer behavior changes',features:['F-001','F-002'],acceptance:['AC-001'],tests:['tests/main.test.mjs'],docs:['docs/functional guide.md']},
   {path:'docs/functional guide.md',impact:'none',reason:'Document corresponding answer behavior',features:[],acceptance:[],tests:[],docs:[]}],
  documentation:Object.fromEntries(roles.map(role=>[role,'docs/functional guide.md'])),
  security:{risk:'low',rationale:'Local fixture without networking or user data',checks:['secrets','dependencies'].map(id=>({id,status:'PASS',method:'Synthetic manual fixture inspection',evidence,revision:current.digest})),findings:[]},
  review:{author:'fixture-implementer',reviewer:'fixture-peer',independent:true,revision:current.digest,evidence,documentation_current:true,security_reviewed:true}};
 bindContext(root,report);pass(await validate(root,report));return {root,report,expectedContextDigest:approved.get(report)};
}

test('quality exports public capture and validation functions',()=>{
 assert.equal(typeof api.captureInventory,'function'); assert.equal(typeof api.validateQuality,'function');
 assert.equal(typeof api.qualityContextDigest,'function');
});
test('AC-002 inventory includes sources tests config docs and dotfiles with exact content hashes',async()=>{
 const root=newRoot(); const files=['src/a.mjs','tests/a.test.mjs','docs/a.md','.env.example','package.json','nested/.config'];
 for (const name of files) put(root,name,`fixture ${name}`);
 for (const name of ['.git/config','node_modules/a.js','.omp/state/x','nested/.git/config','nested/node_modules/x','nested/.omp/x']) put(root,name,'ignored');
 const inventory=await capture(root);
 assert.deepEqual(Object.keys(inventory.files).sort(),files.sort());
 for (const name of files) assert.equal(inventory.files[name],sha(`fixture ${name}`));
 assert.match(inventory.digest,/^[a-f0-9]{64}$/);
 assert.deepEqual(await capture(root),inventory);
 put(root,'.omp/state/other','ignored change'); assert.deepEqual(await capture(root),inventory);
 put(root,'.env.example','changed'); assert.notEqual((await capture(root)).digest,inventory.digest);
});
test('AC-002 inventory content is independent of file creation order',async()=>{
 const a=newRoot(), b=newRoot();
 for (const name of ['z','a','.config']) put(a,name,name);
 for (const name of ['.config','a','z']) put(b,name,name);
 assert.deepEqual(await capture(a),await capture(b));
 assert.match((await capture(a)).digest,/^[a-f0-9]{64}$/);
});
for (const kind of ['hardlink','symlink','junction']) test(`AC-002 inventory refuses ${kind} alias or escape`,async context=>{
 const root=newRoot(), outside=newRoot(); put(outside,'outside.txt','external fixture');
 if (kind==='hardlink') {put(root,'a','fixture');fs.linkSync(path.join(root,'a'),path.join(root,'b'));}
 else if (kind==='symlink') {
  try { fs.symlinkSync(path.join(outside,'outside.txt'),path.join(root,'escape'),'file'); }
  catch(error) { if (error.code==='EPERM') {context.skip('Windows account lacks symbolic-link privilege; junction test still executes');return;} throw error; }
 }
 else fs.symlinkSync(outside,path.join(root,'escape'),'junction');
 await assert.rejects(async()=>{await capture(root);});
});
test('AC-003 delivery accepts shared documents, multiple features, encoded spaces and current independent proof',async()=>{
 const {root,report}=await fixture();pass(await validate(root,report));pass(await validate(root,report,{stage:'delivery'}));
});
test('AC-003 README accepts bracketed links containing literal spaces',async()=>{
 const {root,report}=await fixture();
 put(root,'README.md',roles.map(role=>`- [${role}](<docs/functional guide.md>)`).join('\n'));
 report.changes.push({path:'README.md',impact:'none',reason:'Use angle-wrapped Markdown links',features:[],acceptance:[],tests:[],docs:[]});
 await refresh(root,report);pass(await validate(root,report));
});
async function refresh(root,report) {
 report.revision=(await capture(root)).digest;report.review.revision=report.revision;
 for (const check of report.security.checks) check.revision=report.revision;
 bindContext(root,report);
}
for (const [label,mutate] of [
 ['missing classification',r=>r.changes.pop()],
 ['duplicate classification',r=>r.changes.push(structuredClone(r.changes[0]))],
 ['phantom classification',r=>r.changes.push({...r.changes[0],path:'not-changed.txt'})],
 ['unknown impact',r=>r.changes[0].impact='unknown'],
 ['empty no-impact reason',r=>r.changes[1].reason='  '],
 ['missing feature',r=>r.changes[0].features=[]],
 ['missing acceptance',r=>r.changes[0].acceptance=[]],
 ['missing tests',r=>r.changes[0].tests=[]],
 ['missing docs',r=>r.changes[0].docs=[]],
 ['missing test file',r=>r.changes[0].tests=['tests/missing.mjs']],
 ['missing document',r=>r.documentation.guide='docs/missing.md'],
 ['baseline omitted',r=>delete r.baseline],
 ['baseline digest forged',r=>r.baseline.digest='0'.repeat(64)],
 ['stale delivery revision',r=>r.revision='0'.repeat(64)],
 ['schema unknown',r=>r.schema_version=99],
 ['missing review author',r=>r.review.author=''],
 ['missing reviewer',r=>r.review.reviewer='  '],
 ['self review',r=>r.review.reviewer=r.review.author],
 ['review independence false',r=>r.review.independent=false],
 ['review independence string',r=>r.review.independent='true'],
 ['stale review revision',r=>r.review.revision='0'.repeat(64)],
 ['documentation not reviewed',r=>r.review.documentation_current=false],
 ['security not reviewed',r=>r.review.security_reviewed=false],
 ['review proof forged',r=>r.review.evidence={path:'.omp/state/review.txt',sha256:'0'.repeat(64)}],
 ['missing security rationale',r=>r.security.rationale=''],
 ['invalid risk',r=>r.security.risk='unknown'],
 ['missing secret check',r=>r.security.checks=r.security.checks.filter(c=>c.id!=='secrets')],
 ['missing dependency check',r=>r.security.checks=r.security.checks.filter(c=>c.id!=='dependencies')],
 ['stale check revision',r=>r.security.checks[0].revision='0'.repeat(64)],
 ['check missing method',r=>r.security.checks[0].method=''],
 ['check proof missing',r=>delete r.security.checks[0].evidence],
 ['NA without reason',r=>r.security.checks[1].status='NA'],
 ['high risk without threat model',r=>r.security.risk='high'],
 ['critical open finding',r=>r.security.findings.push({id:'SEC-001',severity:'critical',status:'open',evidence:r.review.evidence})],
 ['high open finding',r=>r.security.findings.push({id:'SEC-002',severity:'high',status:'open',evidence:r.review.evidence})],
]) test(`quality fails closed: ${label}`,async()=>{const {root,report}=await fixture();mutate(report);fail(await validate(root,report));});
test('AC-002 newly added, modified and deleted files each require their own classification',async()=>{
 const {root,report}=await fixture();fs.unlinkSync(path.join(root,'tests/main.test.mjs'));put(root,'tests/new.test.mjs','// Replacement fixture');
 report.changes[0].tests=['tests/new.test.mjs'];await refresh(root,report);fail(await validate(root,report));
 for (const name of ['tests/main.test.mjs','tests/new.test.mjs']) report.changes.push({path:name,impact:'none',reason:'Replace acceptance fixture',features:[],acceptance:[],tests:[],docs:[]});
 bindContext(root,report);
 pass(await validate(root,report));
});
test('AC-003 mere document existence does not satisfy functional update',async()=>{
 const {root,report}=await fixture();
 put(root,'docs/functional guide.md','# Features\n\nF-001 answers one. AC-001: returns one. Usage: call answer.\nHistory: initial fixture.\n');
 report.changes.pop();await refresh(root,report);fail(await validate(root,report));
});
test('AC-003 missing README document links blocks delivery',async()=>{
 const {root,report}=await fixture();put(root,'README.md','# Documentation without navigation');
 report.changes.push({path:'README.md',impact:'none',reason:'Fixture broken navigation',features:[],acceptance:[],tests:[],docs:[]});await refresh(root,report);fail(await validate(root,report));
});
test('AC-004 justified NA and a high-risk threat model may pass with current proof',async()=>{
 const {root,report}=await fixture();report.security.risk='high';report.security.checks[1].status='NA';report.security.checks[1].reason='This synthetic project has no third-party dependencies.';
 report.security.checks.push({...structuredClone(report.security.checks[0]),id:'threat-model'});bindContext(root,report);pass(await validate(root,report));
});
test('AC-004 unavailable tooling is not a reason for security NA',async()=>{
 const {root,report}=await fixture();report.security.checks[1].status='NA';report.security.checks[1].reason='Scanner is not installed or available.';fail(await validate(root,report));
});
test('AC-005 proof changes in ignored operational directory invalidate approval',async()=>{
 const {root,report}=await fixture();put(root,'.omp/state/review.txt','Evidence rewritten after approval');fail(await validate(root,report));
});
test('AC-005 planning permits an honest partial plan without premature final documents or review',async()=>{
 const root=newRoot();put(root,'src/main.mjs','// Planned fixture project');
 const report={schema_version:1,context:fullContext(root),baseline:await capture(root),security:{risk:'low',rationale:'Local fixture without external exposure'},plan:{documentation:'Update feature catalog, specification, guide and history.',security:'Inspect secrets and dependencies.',review:'Independent peer will review current evidence before delivery.'}};
 pass(await validate(root,report,{stage:'planning'}));
 put(root,'new-file.md','Change after planning baseline');fail(await validate(root,report,{stage:'planning'}));
});
for (const unsafe of ['../escape','/absolute','C:\\outside\\file','docs/../../outside']) test(`AC-002 paths refuse escape: ${unsafe}`,async()=>{
 const {root,report}=await fixture();report.changes[0].path=unsafe;fail(await validate(root,report));
 report.changes[0].path='src/main.mjs';report.review.evidence={path:unsafe,sha256:'0'.repeat(64)};fail(await validate(root,report));
});
test('report instructions are data and are never executed by validation',async()=>{
 const {root,report}=await fixture();const marker=path.join(root,'.omp/state/EXECUTED');
 report.security.checks[0].method=`node -e "require('fs').writeFileSync('${marker.replaceAll('\\','/')}','bad')"`;
 bindContext(root,report);pass(await validate(root,report));assert.equal(fs.existsSync(marker),false);
});

test('context digest is stable under object key order and ignores proof envelopes',async()=>{
 assert.equal(typeof api.qualityContextDigest,'function');const {root,report}=await fixture();
 const digest=contextDigest(report),copy=structuredClone(report);
 copy.context.environment={platform:report.context.environment.platform,runtime:report.context.environment.runtime};
 copy.review.evidence={path:'different',sha256:'0'.repeat(64)};copy.review.context_digest='0'.repeat(64);
 for(const check of copy.security.checks){check.evidence={path:'different',sha256:'0'.repeat(64)};check.context_digest='0'.repeat(64);}
 assert.equal(contextDigest(copy),digest);pass(await validate(root,report));
});
for(const [label,mutate] of [
 ['risk',r=>{r.security.risk='medium';}],
 ['criteria',r=>{r.context.criteria[0].description='Unreviewed acceptance requirement';}],
 ['environment',r=>{r.context.environment.runtime='Unreviewed runtime';}],
 ['classification',r=>{r.changes[0].reason='Unreviewed changed behavior classification';}],
 ['reviewer',r=>{r.review.reviewer='another-independent-peer';}],
 ['check method',r=>{r.security.checks[0].method='Unreviewed alternative inspection';}],
]) test(`context change cannot reuse persisted receipts even with recalculated strings: ${label}`,async()=>{
 const {root,report}=await fixture();pass(await validate(root,report));const old=contextDigest(report);mutate(report);
 const next=contextDigest(report);assert.notEqual(next,old,'Context digest must cover the changed field');
 report.review.context_digest=next;report.security.checks.forEach(c=>{c.context_digest=next;});
 fail(await validate(root,report));
});
for(const target of ['review','check']) test(`receipt source hash remains mandatory for ${target}`,async()=>{
 const {root,report}=await fixture();const evidence=target==='review'?report.review.evidence:report.security.checks[0].evidence;
 const receipt=JSON.parse(fs.readFileSync(path.join(root,evidence.path),'utf8'));put(root,receipt.source.path,'Synthetic native output modified after receipt');
 fail(await validate(root,report));
});
for(const segment of ['.git','.GIT','.GiT']) test(`Git-internal evidence aliases are refused: ${segment}`,async()=>{
 const {root,report}=await fixture();const old=fs.readFileSync(path.join(root,report.review.evidence.path),'utf8');
 put(root,'.git/review.json',old);report.review.evidence={path:`${segment}/review.json`,sha256:sha(old)};fail(await validate(root,report));
});
