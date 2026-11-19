import {test, afterEach} from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import * as ship from '../ship/bin/lib.mjs';
import * as quality from '../tdd-orchestrator/lib/quality.mjs';
const {captureInventory}=quality;
const contextDigest=report=>fixtureDigest(report);

// Local synthetic evidence: never executes deployment or report commands.
const check=(root,options={})=>ship.validateShipQuality(root,{...(fs.existsSync(path.join(root,'.omp/state/quality-context.json'))?{contextPath:'.omp/state/quality-context.json'}:{}),...options});
const roots=[];
afterEach(()=>{for (const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true});});
const sha=s=>createHash('sha256').update(s).digest('hex');
function rootFixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ship-quality-'));roots.push(root);return root;}
function put(root,name,value){const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);}
const pass=r=>assert.equal(r.ok,true,JSON.stringify(r.errors));
const fail=r=>{assert.equal(r.ok,false);assert.ok(Array.isArray(r.errors)&&r.errors.length>0);};
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
async function reportFixture(){
 const root=rootFixture();
 put(root,'src/main.mjs','export const answer=1;');
 put(root,'tests/main.test.mjs','// Synthetic acceptance test');
 put(root,'docs/functional.md','# F-001\nAC-001: answer one. Usage: call answer. History: initial.');
 put(root,'README.md','[Functional documentation](docs/functional.md)');
 const baseline=await captureInventory(root);
 put(root,'src/main.mjs','export const answer=2;');
 put(root,'docs/functional.md','# F-001\nAC-001: answer two. Usage: call answer. History: changed to two.');
 const revision=(await captureInventory(root)).digest;
 const body='Synthetic independent review and security evidence.';put(root,'.omp/state/review.txt',body);
 const evidence={path:'.omp/state/review.txt',sha256:sha(body)};
 const report={schema_version:1,baseline,revision,
  changes:[{path:'src/main.mjs',impact:'functional',reason:'Answer changes',features:['F-001'],acceptance:['AC-001'],tests:['tests/main.test.mjs'],docs:['docs/functional.md']},{path:'docs/functional.md',impact:'none',reason:'Update functional explanation',features:[],acceptance:[],tests:[],docs:[]}],
  documentation:{catalog:'docs/functional.md',specification:'docs/functional.md',guide:'docs/functional.md',history:'docs/functional.md'},
  security:{risk:'low',rationale:'Local fixture without network or third-party packages',checks:['secrets','dependencies'].map(id=>({id,status:'PASS',method:'Synthetic fixture inspection',evidence,revision})),findings:[]},
  review:{author:'fixture-author',reviewer:'fixture-peer',independent:true,revision,evidence,documentation_current:true,security_reviewed:true}};
 bindContext(root,report);const reportPath='.omp/state/quality.json';put(root,reportPath,JSON.stringify(report));
 pass(await check(root,{required:true,reportPath}));
 return {root,report,reportPath,contextPath:'.omp/state/quality-context.json',save:()=>put(root,reportPath,JSON.stringify(report))};
}
test('Ship exports the reusable quality gate',()=>assert.equal(typeof ship.validateShipQuality,'function'));
test('legacy configuration without report remains explicitly identifiable',async()=>{
 const root=rootFixture();const result=await check(root,{});pass(result);assert.equal(result.legacy,true);assert.equal(result.report,null);
 const explicit=await check(root,{required:false});pass(explicit);assert.equal(explicit.legacy,true);
});
test('required policy refuses absent report rather than silently falling back to legacy',async()=>{
 fail(await check(rootFixture(),{required:true}));
});
for (const required of ['true','false',1,0,null,[],{}]) test(`required is a strict boolean: ${JSON.stringify(required)}`,async()=>{
 fail(await check(rootFixture(),{required}));
});
test('required policy accepts valid delivery report and returns its data',async()=>{
 const {root,report,reportPath}=await reportFixture();const result=await check(root,{required:true,reportPath});
 pass(result);assert.equal(result.legacy,false);assert.deepEqual(result.report,report);
});
test('explicit report under legacy policy is always validated',async()=>{
 const {root,report,reportPath,save}=await reportFixture();pass(await check(root,{required:false,reportPath}));
 report.review.reviewer=report.review.author;save();fail(await check(root,{required:false,reportPath}));
});
test('delivery report becomes stale after source changes',async()=>{
 const {root,reportPath}=await reportFixture();put(root,'src/main.mjs','export const answer=3;');fail(await check(root,{required:true,reportPath}));
});
test('planning-only report cannot authorize Ship delivery',async()=>{
 const root=rootFixture(),reportPath='.omp/state/quality.json';
 const report={schema_version:1,context:fullContext(root),baseline:await captureInventory(root),security:{risk:'low',rationale:'Synthetic fixture'},plan:{documentation:'Write docs',security:'Inspect security',review:'Peer review'}};
 put(root,'.omp/state/quality-context.json',JSON.stringify({schema_version:1,context_digest:fixtureDigest(report)}));
 put(root,reportPath,JSON.stringify(report));fail(await check(root,{required:true,reportPath}));
});
for (const reportPath of ['../quality.json','/quality.json','C:\\outside\\quality.json','docs/../../quality.json','https://example.test/quality.json']) test(`report path must stay inside project: ${reportPath}`,async()=>{
 fail(await check(rootFixture(),{reportPath,required:false}));
});
test('explicit missing report is an error even in legacy mode',async()=>{fail(await check(rootFixture(),{reportPath:'.omp/state/missing.json'}));});
test('malformed JSON and directory reports fail with diagnostics',async()=>{
 const root=rootFixture();put(root,'.omp/state/quality.json','{broken');fail(await check(root,{reportPath:'.omp/state/quality.json'}));
 fail(await check(root,{reportPath:'.omp/state'}));
});
test('report hardlink is refused',async()=>{
 const {root,reportPath}=await reportFixture();fs.linkSync(path.join(root,reportPath),path.join(root,'.omp/state/alias.json'));
 fail(await check(root,{reportPath:'.omp/state/alias.json',required:true}));
});
test('report directory junction cannot escape root',async()=>{
 const root=rootFixture(),outside=rootFixture();put(outside,'quality.json','{}');fs.symlinkSync(outside,path.join(root,'escape'),'junction');
 fail(await check(root,{reportPath:'escape/quality.json',required:true}));
});
test('gate only reads report commands and does not execute them',async()=>{
 const {root,report,reportPath,save}=await reportFixture();
 report.security.checks[0].method='node -e "require(\'fs\').writeFileSync(\'.omp/state/EXECUTED\',\'bad\')"';save();
 bindContext(root,report);save();pass(await check(root,{reportPath,required:true}));assert.equal(fs.existsSync(path.join(root,'.omp/state/EXECUTED')),false);
});
