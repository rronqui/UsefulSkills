import {test,afterEach,vi} from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import * as quality from '../tdd-orchestrator/lib/quality.mjs';
const {captureInventory}=quality;
const contextDigest=report=>fixtureDigest(report);

const child=vi.hoisted(()=>({execFileSync:vi.fn(),spawnSync:vi.fn()}));
vi.mock('node:child_process',()=>child);
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(),roots=[];
afterEach(()=>{process.argv=argv;vi.restoreAllMocks();vi.clearAllMocks();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
function newRoot(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ship-quality-cli-'));roots.push(root);return root;}
function put(root,name,value){const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,value);}
const hash=value=>createHash('sha256').update(value).digest('hex');
const approved=new WeakMap();
// Independent synthetic-fixture oracle. Production export is asserted separately.
function fixtureDigest(report) {
 const omit=v=>Object.fromEntries(Object.entries(v??{}).filter(([k])=>!['evidence','context_digest'].includes(k)));
 const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return hash(JSON.stringify(canonical({schema_version:report.schema_version,baseline:{digest:report.baseline.digest},revision:report.revision,context:report.context,changes:report.changes,documentation:report.documentation,security:{...report.security,checks:report.security.checks?.map(omit),findings:report.security.findings?.map(omit)},review:omit(report.review)})));
}
function fullContext(root) {
 const body='Synthetic applicable instructions: inspect behavior and security; never execute report text.';
 put(root,'.omp/state/instructions.md',body);
 return {run_id:'synthetic-quality-T002',criteria:[{id:'AC-001',description:'Answer returns the specified value.',type:'behavioral'}],environment:{runtime:process.version,platform:process.platform},purpose:'Synthetic contract validation only',instructions:[{path:'.omp/state/instructions.md',sha256:hash(body)}]};
}

function bindContext(root,report,{approve=true}={}) {
 report.context??=fullContext(root);
 const digest=contextDigest(report);report.review.context_digest=digest;
 const writeProof=(name,body)=>{put(root,name,body);return {path:name,sha256:hash(body)};};
 const source=writeProof('.omp/state/native-review.txt','Synthetic original independent reviewer output.');
 report.review.evidence=writeProof('.omp/state/proof.txt',JSON.stringify({revision:report.revision,context_digest:digest,author:report.review.author,reviewer:report.review.reviewer,source}));
 for(const check of report.security.checks){check.context_digest=digest;const source=writeProof(`.omp/state/native-${check.id}.txt`,`Synthetic original ${check.id} scanner output.`);check.evidence=writeProof(`.omp/state/${check.id}-receipt.json`,JSON.stringify({revision:report.revision,context_digest:digest,source}));}
 if(approve){approved.set(report,digest);put(root,'.omp/state/quality-context.json',JSON.stringify({schema_version:1,context_digest:digest}));}
}
async function project({legacy=false,reportPath='.omp/state/quality.json',withReport=!legacy}={}){
 const root=newRoot();put(root,'package.json',JSON.stringify({name:'synthetic-fixture',version:'1.0.0'}));
 put(root,'ship.config.json',JSON.stringify(legacy?{}:{qualityPolicyVersion:1,qualityReport:reportPath,qualityContext:'.omp/state/quality-context.json'}));
 put(root,'README.md','[Functional documentation](docs/functional.md)');
 put(root,'src/main.mjs','export const answer=1;');put(root,'tests/main.test.mjs','// Synthetic test source');
 put(root,'docs/functional.md','# F-001\nAC-001 returns one. Usage: answer. History: initial.');
 const baseline=captureInventory(root);
 put(root,'src/main.mjs','export const answer=2;');put(root,'docs/functional.md','# F-001\nAC-001 returns two. Usage: answer. History: changed to two.');
 const revision=captureInventory(root).digest,body='Synthetic current review evidence.';
 put(root,'.omp/state/proof.txt',body);const evidence={path:'.omp/state/proof.txt',sha256:hash(body)};
 const report={schema_version:1,baseline,revision,changes:[{path:'src/main.mjs',impact:'functional',reason:'Answer changes',features:['F-001'],acceptance:['AC-001'],tests:['tests/main.test.mjs'],docs:['docs/functional.md']},{path:'docs/functional.md',impact:'none',reason:'Functional documentation update',features:[],acceptance:[],tests:[],docs:[]}],documentation:{catalog:'docs/functional.md',specification:'docs/functional.md',guide:'docs/functional.md',history:'docs/functional.md'},security:{risk:'low',rationale:'Synthetic local fixture with no external data',checks:['secrets','dependencies'].map(id=>({id,status:'PASS',method:'Synthetic manual inspection',revision,evidence})),findings:[]},review:{author:'fixture-author',reviewer:'fixture-peer',independent:true,revision,evidence,documentation_current:true,security_reviewed:true}};
 bindContext(root,report);if(withReport)put(root,reportPath,JSON.stringify(report));else fs.unlinkSync(path.join(root,'.omp/state/quality-context.json'));return {root,report,reportPath,contextPath:'.omp/state/quality-context.json'};
}
function harness(root,{existingPr=false,onCall=()=>{}}={}){
 const calls=[];const errors=[],warnings=[];
 vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation((...args)=>errors.push(args.join(' ')));vi.spyOn(console,'warn').mockImplementation((...args)=>warnings.push(args.join(' ')));
 vi.spyOn(process,'exit').mockImplementation(code=>{throw Error(`fixture-exit-${code}`);});
 child.execFileSync.mockImplementation((command,args)=>{
  calls.push({command,args:[...args]});onCall(command,args);
  if(command==='git'){
   if(args[0]==='rev-parse'&&args[1]==='--show-toplevel')return root;
   if(args[0]==='branch')return 'feat/12-quality';
   if(args[0]==='rev-list')return '1';return '';
  }
  if(command==='gh'){
   if(args[0]==='repo')return 'fixture-owner/fixture-repo';
   if(args[0]==='api')return String(args[1]).endsWith('/labels')?'enhancement\nbug':'main';
   if(args[0]==='pr'&&args[1]==='list')return existingPr?'https://github.com/fixture-owner/fixture-repo/pull/12':'';
   if(args[0]==='pr'&&args[1]==='view')return JSON.stringify({body:'Initial fixture body'});
   if(args[0]==='pr'&&args[1]==='create')return 'https://github.com/fixture-owner/fixture-repo/pull/12';
  }
  return '';
 });
 child.spawnSync.mockImplementation((command,args)=>{calls.push({command,args:[...args]});onCall(command,args);return {status:command==='git'&&args[0]==='diff'?1:0};});
 return {calls,errors,warnings};
}
async function run(args){process.argv=[argv[0],'ship/bin/ship.mjs',...args];vi.resetModules();await import('../ship/bin/ship.mjs');}
function controlledReportSwapPreload(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ship-quality-preload-'));roots.push(dir);
 const file=path.join(dir,'swap.cjs');
 fs.writeFileSync(file,`const fs=require('node:fs');const path=require('node:path');const {syncBuiltinESMExports}=require('node:module');
const report=path.resolve(process.env.QUALITY_SWAP_REPORT),context=path.resolve(process.env.QUALITY_SWAP_CONTEXT),marker=path.resolve(process.env.QUALITY_SWAP_MARKER),replacement=Buffer.from(process.env.QUALITY_SWAP_BYTES,'base64');
const open=fs.openSync,write=fs.writeFileSync;let swapped=false;
fs.openSync=(file,...args)=>{const fd=open(file,...args);if(!swapped&&typeof file==='string'&&path.resolve(file)===context){swapped=true;write(report,replacement);write(marker,'swapped');}return fd;};syncBuiltinESMExports();`);
 return file;
}
const has=(calls,command,...args)=>calls.some(c=>c.command===command&&args.every((v,i)=>c.args[i]===v));
function noPublication(calls){assert.equal(calls.some(c=>c.command==='gh'),false,'No gh call before quality passes');assert.equal(has(calls,'git','commit'),false);assert.equal(has(calls,'git','push'),false);}

test('required Ship config blocks missing quality report before gh commit or push',async()=>{
 const {root,reportPath}=await project();fs.unlinkSync(path.join(root,reportPath));const h=harness(root);
 await assert.rejects(run(['ship','Fixture change']),/fixture-exit-1/);noPublication(h.calls);assert.match(h.errors.join('\n'),/E_QUALITY/);
});
test('stale report blocks publication at the engine boundary',async()=>{
 const {root}=await project();put(root,'src/main.mjs','export const answer=3;');const h=harness(root);
 await assert.rejects(run(['ship','Fixture change']),/fixture-exit-1/);noPublication(h.calls);assert.match(h.errors.join('\n'),/E_QUALITY/);
});
test('quality report override is validated and absent from commit and PR descriptions',async()=>{
 const {root,reportPath}=await project({reportPath:'.omp/state/override.json'});const cfg=JSON.parse(fs.readFileSync(path.join(root,'ship.config.json'),'utf8'));cfg.qualityReport='.omp/state/missing.json';cfg.qualityContext='.omp/state/missing-context.json';
 // Config changes must be part of the approved inventory as well.
 put(root,'ship.config.json',JSON.stringify(cfg));const report=JSON.parse(fs.readFileSync(path.join(root,reportPath),'utf8'));
 report.changes.push({path:'ship.config.json',impact:'none',reason:'Fixture tests explicit report override',features:[],acceptance:[],tests:[],docs:[]});report.revision=captureInventory(root).digest;report.review.revision=report.revision;report.security.checks.forEach(c=>c.revision=report.revision);bindContext(root,report);put(root,reportPath,JSON.stringify(report));
 const h=harness(root);await run(['ship','Fixture change','--quality-report',reportPath,'--quality-context','.omp/state/quality-context.json']);
 assert.ok(has(h.calls,'git','push'));assert.ok(has(h.calls,'gh','pr','create'));
 const commit=h.calls.find(c=>c.command==='git'&&c.args[0]==='commit');assert.equal(commit.args[2],'feat: Fixture change (#12)');
 const pr=h.calls.find(c=>c.command==='gh'&&c.args[0]==='pr'&&c.args[1]==='create');assert.equal(pr.args[pr.args.indexOf('--title')+1],'feat: Fixture change');assert.equal(pr.args.join(' ').includes('--quality-report'),false);assert.equal(pr.args.join(' ').includes('--quality-context'),false);
});
test('legacy config warns explicitly and keeps existing Ship behavior',async()=>{
 const {root}=await project({legacy:true});const h=harness(root);await run(['ship','Fixture legacy change']);
 assert.match(h.warnings.join('\n'),/E_QUALITY_LEGACY/);assert.ok(has(h.calls,'git','push'));assert.ok(has(h.calls,'gh','pr','create'));
});
test('source mutation by simulated commit hook invalidates report before push',async()=>{
 const {root}=await project();const h=harness(root,{onCall(command,args){if(command==='git'&&args[0]==='commit')put(root,'src/main.mjs','export const answer=999;');}});
 await assert.rejects(run(['ship','Fixture change']),/fixture-exit-1/);assert.ok(has(h.calls,'git','commit'));assert.equal(has(h.calls,'git','push'),false);assert.equal(has(h.calls,'gh','pr','create'),false);assert.match(h.errors.join('\n'),/E_QUALITY/);
});
test('body-only retry cannot bypass missing quality report',async()=>{
 const {root,reportPath}=await project();put(root,'.omp/state/body.md','Fixture body update');fs.unlinkSync(path.join(root,reportPath));const h=harness(root,{existingPr:true});
 await assert.rejects(run(['ship','Fixture change','--body-file','.omp/state/body.md']),/fixture-exit-1/);noPublication(h.calls);assert.equal(has(h.calls,'gh','pr','edit'),false);
});
test('body-only retry rechecks approval after PR discovery before gh edit',async()=>{
 const {root}=await project();put(root,'.omp/state/body.md','Fixture body update');const h=harness(root,{existingPr:true,onCall(command,args){if(command==='gh'&&args[0]==='pr'&&args[1]==='list')put(root,'src/main.mjs','export const answer=999;');}});
 await assert.rejects(run(['ship','Fixture change','--body-file','.omp/state/body.md']),/fixture-exit-1/);assert.equal(has(h.calls,'gh','pr','edit'),false);assert.equal(has(h.calls,'git','push'),false);assert.match(h.errors.join('\n'),/E_QUALITY/);
});
test('setup creates policy version and default report path',async()=>{
 const root=newRoot();harness(root);await run(['setup']);const config=JSON.parse(fs.readFileSync(path.join(root,'ship.config.json'),'utf8'));
 assert.equal(config.qualityPolicyVersion,1);assert.equal(config.qualityReport,'.omp/state/quality.json');assert.equal(config.qualityContext,'.omp/state/quality-context.json');
});
test('setup preserves existing config byte-for-byte including legacy status',async()=>{
 const root=newRoot(),config='{ "buildCommand": "fixture-build", "custom": true }\n';put(root,'ship.config.json',config);harness(root);await run(['setup']);
 assert.equal(fs.readFileSync(path.join(root,'ship.config.json'),'utf8'),config);
});
test('real quality CLI capture and check return structured results and proper exit codes',async()=>{
 const {spawnSync}=await vi.importActual('node:child_process');const {root,reportPath}=await project();
 const bin=path.join(repo,'tdd-orchestrator/bin/quality.mjs');const captured=spawnSync(process.execPath,[bin,'capture',root],{encoding:'utf8'});
 assert.equal(captured.status,0,captured.stderr);assert.deepEqual(JSON.parse(captured.stdout),captureInventory(root));
 const checked=spawnSync(process.execPath,[bin,'check',root,path.join(root,reportPath),'delivery','--quality-context','.omp/state/quality-context.json'],{encoding:'utf8'});assert.equal(checked.status,0,checked.stderr+checked.stdout);assert.equal(JSON.parse(checked.stdout).ok,true);
 put(root,'src/main.mjs','export const answer=999;');const stale=spawnSync(process.execPath,[bin,'check',root,path.join(root,reportPath),'delivery','--quality-context','.omp/state/quality-context.json'],{encoding:'utf8'});assert.equal(stale.status,1);assert.equal(JSON.parse(stale.stdout).ok,false);
});
test('AC-004 real quality CLI capture rejects an empty extra argument and valid capture is read-only',async()=>{
 const {spawnSync}=await vi.importActual('node:child_process');const {root,reportPath,contextPath}=await project();
 const reportBefore=fs.readFileSync(path.join(root,reportPath)),contextBefore=fs.readFileSync(path.join(root,contextPath));
 const bin=path.join(repo,'tdd-orchestrator/bin/quality.mjs');
 const invalid=spawnSync(process.execPath,[bin,'capture',root,''],{encoding:'utf8'});
 assert.equal(invalid.status,1,invalid.stdout+invalid.stderr);
 assert.equal(JSON.parse((invalid.stderr||invalid.stdout).trim()).ok,false);
 const valid=spawnSync(process.execPath,[bin,'capture',root],{encoding:'utf8'});
 assert.equal(valid.status,0,valid.stderr);
 assert.deepEqual(JSON.parse(valid.stdout),captureInventory(root));
 assert.deepEqual(fs.readFileSync(path.join(root,reportPath)),reportBefore);
 assert.deepEqual(fs.readFileSync(path.join(root,contextPath)),contextBefore);
});
test('AC-004 real quality CLI rejects a report replaced while reading independent context',async()=>{
 const {spawnSync}=await vi.importActual('node:child_process');const {root,reportPath,contextPath}=await project();
 const outside=newRoot(),sentinel=path.join(outside,'sentinel.txt');put(outside,'sentinel.txt','untouched');
 const marker='.omp/state/preload-swap.txt',preload=controlledReportSwapPreload(),env={...process.env};
 delete env.NODE_OPTIONS;
 Object.assign(env,{QUALITY_SWAP_REPORT:path.join(root,reportPath),QUALITY_SWAP_CONTEXT:path.join(root,contextPath),QUALITY_SWAP_MARKER:path.join(root,marker),QUALITY_SWAP_BYTES:Buffer.from('{"schema_version":1}').toString('base64')});
 const bin=path.join(repo,'tdd-orchestrator/bin/quality.mjs');
 const result=spawnSync(process.execPath,['--require',preload,bin,'check',root,path.join(root,reportPath),'delivery','--quality-context',contextPath],{encoding:'utf8',env});
 assert.equal(result.status,1,result.stdout+result.stderr);
 assert.equal(JSON.parse((result.stdout.trim()?result.stdout:result.stderr).trim()).ok,false,result.stdout+result.stderr);
 assert.equal(fs.readFileSync(path.join(root,marker),'utf8'),'swapped');
 assert.deepEqual(fs.readFileSync(path.join(root,reportPath)),Buffer.from('{"schema_version":1}'));
 assert.equal(fs.readFileSync(sentinel,'utf8'),'untouched');
});

test('legacy present report is revalidated before publication',async()=>{
 const {root,report,reportPath}=await project({legacy:true,withReport:true});report.review.reviewer=report.review.author;put(root,reportPath,JSON.stringify(report));const h=harness(root);
 await assert.rejects(run(['ship','Fixture legacy change']),/fixture-exit-1/);noPublication(h.calls);assert.match(h.errors.join(' '),/E_QUALITY/);
});
for(const target of ['context','receipt','source']) test(`operational ${target} mutation by simulated commit hook blocks push`,async()=>{
 const f=await project();const h=harness(f.root,{onCall(command,args){if(command==='git'&&args[0]==='commit'){const name=target==='context'?f.contextPath:target==='receipt'?f.report.review.evidence.path:'.omp/state/native-review.txt';put(f.root,name,'Synthetic unapproved mutation');}}});
 await assert.rejects(run(['ship','Fixture change']),/fixture-exit-1/);assert.ok(has(h.calls,'git','commit'));assert.equal(has(h.calls,'git','push'),false);assert.equal(has(h.calls,'gh','pr','create'),false);assert.match(h.errors.join(' '),/E_QUALITY/);
});
for(const value of [null,'../outside.json','.GIT/context.json']) test(`quality-context flag rejects unsafe or missing value: ${value}`,async()=>{
 const {root}=await project();const h=harness(root);const args=['ship','Fixture change','--quality-context'];if(value!==null)args.push(value);
 await assert.rejects(run(args),/fixture-exit-1/);noPublication(h.calls);assert.match(h.errors.join(' '),/QUALITY|context|argument/i);
});

for(const target of ['context','receipt','source']) test(`body-only retry rechecks operational ${target} before gh edit`,async()=>{
 const f=await project();put(f.root,'.omp/state/body.md','Synthetic body update');const h=harness(f.root,{existingPr:true,onCall(command,args){if(command==='gh'&&args[0]==='pr'&&args[1]==='list'){const name=target==='context'?f.contextPath:target==='receipt'?f.report.review.evidence.path:'.omp/state/native-review.txt';put(f.root,name,'Synthetic unapproved mutation');}}});
 await assert.rejects(run(['ship','Fixture change','--body-file','.omp/state/body.md']),/fixture-exit-1/);assert.equal(has(h.calls,'gh','pr','edit'),false);assert.equal(has(h.calls,'git','push'),false);assert.match(h.errors.join(' '),/E_QUALITY/);
});

// T-002-proof-closure / attempt 2: preserve initial proof bytes across effects.
// These Git/GH boundaries use the existing Vitest child-process doubles only.
function replaceProofKeepingContext(f,target) {
 const contextBefore=fixtureDigest(f.report);
 const expectedBefore=fs.readFileSync(path.join(f.root,f.contextPath));
 const owner=target==='review'?f.report.review:f.report.security.checks.find(c=>c.id==='secrets');
 const oldEvidence={...owner.evidence};
 const receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));
 const oldSourceHash=receipt.source.sha256;
 const body=`Synthetic UNAPPROVED ${target} replacement after first gate; same canonical decisions.`;
 put(f.root,receipt.source.path,body);receipt.source.sha256=hash(body);
 const receiptBody=JSON.stringify(receipt);put(f.root,owner.evidence.path,receiptBody);owner.evidence.sha256=hash(receiptBody);
 put(f.root,f.reportPath,JSON.stringify(f.report));
 assert.notEqual(receipt.source.sha256,oldSourceHash,'Attack changes original source bytes');
 assert.notEqual(owner.evidence.sha256,oldEvidence.sha256,'Attack updates receipt and its real hash');
 assert.equal(fixtureDigest(f.report),contextBefore,'Attack preserves the canonical context');
 assert.deepEqual(fs.readFileSync(path.join(f.root,f.contextPath)),expectedBefore,'Independent expected file stays unchanged');
 assert.equal(hash(fs.readFileSync(path.join(f.root,receipt.source.path))),receipt.source.sha256);
 assert.equal(hash(fs.readFileSync(path.join(f.root,owner.evidence.path))),owner.evidence.sha256);
}
for(const existingPr of [false,true]) test(`AC-005 proof-closure unchanged proof graph accepts simulated ${existingPr?'body-only retry':'normal Ship'}`,async()=>{
 const f=await project();const initial=quality.validateQuality(f.root,f.report,{expectedContextDigest:approved.get(f.report)});assert.equal(initial.ok,true,JSON.stringify(initial.errors));
 const expected=fs.readFileSync(path.join(f.root,f.contextPath));const reportBytes=fs.readFileSync(path.join(f.root,f.reportPath));
 const h=harness(f.root,{existingPr});const args=['ship','Unchanged synthetic proofs'];
 if(existingPr){put(f.root,'.omp/state/body.md','Synthetic unchanged proof retry');args.push('--body-file','.omp/state/body.md');}
 await run(args);assert.ok(has(h.calls,'gh','pr',existingPr?'edit':'create'));assert.ok(has(h.calls,'gh','pr','merge'));
 assert.equal(has(h.calls,'git','push'),!existingPr);assert.deepEqual(fs.readFileSync(path.join(f.root,f.reportPath)),reportBytes);assert.deepEqual(fs.readFileSync(path.join(f.root,f.contextPath)),expected);
});
for(const target of ['review','secrets']) for(const boundary of ['commit','push','PR discovery','PR create']) test(`AC-005 proof-closure rejects reissued ${target} source and receipt after ${boundary}`,async()=>{
 const f=await project();const initial=quality.validateQuality(f.root,f.report,{expectedContextDigest:approved.get(f.report)});assert.equal(initial.ok,true,JSON.stringify(initial.errors));
 const existingPr=boundary==='PR discovery';let mutations=0;
 const h=harness(f.root,{existingPr,onCall(command,args){
  const hit=boundary==='commit'?command==='git'&&args[0]==='commit':boundary==='push'?command==='git'&&args[0]==='push':command==='gh'&&args[0]==='pr'&&args[1]===(existingPr?'list':'create');
  if(hit){assert.equal(mutations,0,'Exactly one attack at the named boundary');replaceProofKeepingContext(f,target);mutations++;}
 }});
 const args=['ship','Synthetic proof replacement'];if(existingPr){put(f.root,'.omp/state/body.md','Synthetic replacement body');args.push('--body-file','.omp/state/body.md');}
 let caught;try{await run(args);}catch(error){caught=error;}
 assert.equal(mutations,1,'Valid initial gate must reach the simulated attack');
 const forbidden=boundary==='commit'?['git','push']:boundary==='push'?['gh','pr','create']:existingPr?['gh','pr','edit']:['gh','pr','merge'];
 assert.equal(has(h.calls,...forbidden),false,`Reissued ${target} proof reached forbidden ${forbidden.join(' ')} after ${boundary}`);
 assert.match(caught?.message??'',/fixture-exit-1/,'Proof replacement must produce a quality refusal');
 assert.match(h.errors.join(' '),/E_QUALITY/);assert.doesNotMatch(h.errors.join(' '),/context.*required|context.*missing/i,'A complete unchanged context is not the rejection cause');
 assert.equal(has(h.calls,'gh','pr','merge'),false);
});
