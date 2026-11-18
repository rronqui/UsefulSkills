import {test, afterEach, vi} from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {validateShipQuality} from '../ship/bin/lib.mjs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Synthetic projects and proofs: no fixture claims real security or reviewer work.
let api = {};
try { api = await import('../tdd-orchestrator/lib/quality.mjs'); }
catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
const capture = api.captureInventory ?? (() => ({files:{}, digest:''}));
// Frozen setup approval, never recomputed during validation.
const validate = (root,report,options={}) => api.validateQuality(root,report,{expectedContextDigest:approved.get(report),...options});
const contextDigest = report => fixtureDigest(report);
const roots = [];
afterEach(() => { vi.restoreAllMocks(); syncBuiltinESMExports(); for (const root of roots.splice(0)) fs.rmSync(root, {recursive:true, force:true}); });
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
function installOriginalJSONSource(f,owner,label,sourceValue) {
 const expected=approved.get(f.report);
 const original={revision:f.report.revision,context_digest:expected,source:sourceValue,function:'synthetic source metadata',findings:[],status:'PASS'};
 const sourcePath=`.omp/state/${label}-original.json`,sourceBody=JSON.stringify(original),source=proof(f.root,sourcePath,sourceBody);
 const receiptPath=owner.evidence.path,receipt=JSON.parse(fs.readFileSync(path.join(f.root,receiptPath),'utf8'));
 receipt.source=source;
 const receiptBody=JSON.stringify(receipt);owner.evidence=proof(f.root,receiptPath,receiptBody);
 return {expected,original,source,sourceBody,receiptPath,receiptBody};
}

function assertOriginalJSONSourceHashes(f,owner,installed,contextBytes) {
 assert.equal(installed.original.revision,f.report.revision);
 assert.equal(installed.original.context_digest,installed.expected);
 assert.equal(installed.source.sha256,sha(fs.readFileSync(path.join(f.root,installed.source.path))));
 assert.equal(owner.evidence.sha256,sha(fs.readFileSync(path.join(f.root,installed.receiptPath))));
 assert.equal(approved.get(f.report),installed.expected,'Independent approval is not renewed by source metadata');
 assert.deepEqual(fs.readFileSync(path.join(f.root,'.omp/state/quality-context.json')),contextBytes,'Independent context bytes remain frozen');
}

const pass = result => assert.equal(result.ok,true,JSON.stringify(result.errors));
const fail = result => { assert.equal(result.ok,false); assert.ok(Array.isArray(result.errors)&&result.errors.length>0,'diagnostic errors required'); };
const roles = ['catalog','specification','guide','history'];
async function fixture() {
 const root=newRoot();
 put(root,'src/main.mjs','export const answer = 1;\n');
 put(root,'tests/main.test.mjs','// Synthetic acceptance test source\n');
 put(root,'docs/functional guide.md','# Features\n\nF-001 answers one. AC-001: returns one. Usage: call answer.\nHistory: initial fixture.\n');
 put(root,'README.md',roles.map(role=>`- [${role}](docs/functional%20guide.md)`).join('\n')+'\n'+['.git','.GIT','.GiT'].map(segment=>`[Git payload fixture](${segment}/guide.md)`).join('\n'));
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


const saveReport=(f,name='.omp/state/quality.json')=>{put(f.root,name,JSON.stringify(f.report));return name;};
const shipOptions=f=>({required:true,reportPath:saveReport(f),contextPath:'.omp/state/quality-context.json'});
const reject=async(f,pattern)=>{const result=await validate(f.root,f.report);fail(result);if(pattern)assert.match(result.errors.join(' '),pattern);};

for(const value of [undefined,null,[],{},0,'','F'.repeat(64),'a'.repeat(63),'z'.repeat(64)]) test(`AC-005 P1 expected context is mandatory and strict: ${JSON.stringify(value)}`,async()=>{
 const f=await fixture();const result=await api.validateQuality(f.root,f.report,{expectedContextDigest:value});fail(result);assert.match(result.errors.join(' '),/context|expected/i);
});
test('AC-005 P1 expected digest differs from self-consistent report',async()=>{
 const f=await fixture();fail(await api.validateQuality(f.root,f.report,{expectedContextDigest:'0'.repeat(64)}));
});
for(const [label,mutate] of [
 ['risk',r=>r.security.risk='medium'],['criteria',r=>r.context.criteria[0].description='Unreviewed replacement'],
 ['environment',r=>r.context.environment.runtime='Unreviewed runtime'],['classification',r=>r.changes[0].reason='Unreviewed classification'],
 ['reviewer',r=>r.review.reviewer='unreviewed-peer'],['method',r=>r.security.checks[0].method='Unreviewed method'],
 ['purpose',r=>r.context.purpose='Unreviewed purpose'],['run',r=>r.context.run_id='other-run'],
 ['instruction hash',r=>r.context.instructions[0].sha256='0'.repeat(64)],['extra metadata',r=>r.context.decision={scope:'unreviewed'}]
]) test(`AC-005 P1 reissued receipts cannot replace frozen expected approval: ${label}`,async()=>{
 const f=await fixture(),expected=f.expectedContextDigest;mutate(f.report);bindContext(f.root,f.report,{approve:false});
 assert.equal(approved.get(f.report),expected,'Attacker cannot refresh independent approval');
 assert.notEqual(f.report.review.context_digest,expected);await reject(f,/context|instruction/i);
});
test('AC-004 P1 exact inherited risk downgrade and unreviewed acceptance cannot reuse approval',async()=>{
 const f=await fixture();f.report.security.risk='high';f.report.security.checks.push({...structuredClone(f.report.security.checks[0]),id:'threat-model'});bindContext(f.root,f.report);pass(await validate(f.root,f.report));
 f.report.security.risk='low';f.report.security.checks=f.report.security.checks.filter(c=>c.id!=='threat-model');f.report.changes[0].acceptance=['AC-NEW-UNREVIEWED'];await reject(f,/context/i);
});
for(const [label,mutate] of [
 ['run absent',r=>delete r.context.run_id],['purpose empty',r=>r.context.purpose=' '],['criteria empty',r=>r.context.criteria=[]],
 ['duplicate criterion',r=>r.context.criteria.push({...r.context.criteria[0]})],['criterion type absent',r=>delete r.context.criteria[0].type],
 ['environment empty',r=>r.context.environment={}],['instructions absent',r=>delete r.context.instructions]
]) test(`AC-005 malformed context fails closed: ${label}`,async()=>{const f=await fixture();mutate(f.report);await reject(f,/context|criteria|purpose|instruction|environment|run/i);});
test('AC-005 digest API recursively orders objects, preserves arrays and decision metadata',async()=>{
 assert.equal(typeof api.qualityContextDigest,'function');const f=await fixture();f.report.context.extra={nested:{b:2,a:1},array:['first','second']};const a=api.qualityContextDigest(f.report);
 const copy=structuredClone(f.report);copy.context.extra={array:['first','second'],nested:{a:1,b:2}};assert.equal(api.qualityContextDigest(copy),a);
 copy.context.extra.array.reverse();assert.notEqual(api.qualityContextDigest(copy),a);
 copy.context.extra.array.reverse();copy.security.checks[0].reviewer='additional-reviewer';assert.notEqual(api.qualityContextDigest(copy),a);
});
for(const [label,value] of [['undefined',undefined],['NaN',NaN],['Infinity',Infinity],['function',()=>{}]]) test(`AC-005 digest rejects non-JSON input: ${label}`,async()=>{
 assert.equal(typeof api.qualityContextDigest,'function');const f=await fixture();f.report.context.extra=value;assert.throws(()=>api.qualityContextDigest(f.report));
});
test('AC-005 digest rejects cycles',async()=>{assert.equal(typeof api.qualityContextDigest,'function');const f=await fixture();f.report.context.extra=f.report.context;assert.throws(()=>api.qualityContextDigest(f.report));});
for(const target of ['review','check']) for(const attack of ['tampered','absent','stale receipt context','stale receipt revision','receipt not JSON','source equals receipt']) test(`AC-004 receipt/source integrity ${target}: ${attack}`,async()=>{
 const f=await fixture(),owner=target==='review'?f.report.review:f.report.security.checks[0];const receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));
 if(attack==='tampered')put(f.root,receipt.source.path,'Unreviewed altered original');
 if(attack==='absent')fs.unlinkSync(path.join(f.root,receipt.source.path));
 if(attack==='stale receipt context')receipt.context_digest='0'.repeat(64);
 if(attack==='stale receipt revision')receipt.revision='0'.repeat(64);
 if(attack==='source equals receipt')receipt.source={...owner.evidence};
 const body=attack==='receipt not JSON'?'not JSON':JSON.stringify(receipt);put(f.root,owner.evidence.path,body);owner.evidence.sha256=sha(body);
 await reject(f,/receipt|source|context|revision|JSON|cycle|evidence/i);
});
for(const segment of ['.git','.GIT','.GiT']) for(const target of ['review receipt','check receipt','review source','check source','instructions','report','context','test reference','documentation']) test(`AC-002 P2 Git alias denied ${target}: ${segment}`,async()=>{
 const f=await fixture();const options=shipOptions(f);let from,to;
 if(target==='report'){from=options.reportPath;to=`${segment}/quality.json`;}
 else if(target==='context'){from=options.contextPath;to=`${segment}/context.json`;}
 else if(target==='instructions'){from=f.report.context.instructions[0].path;to=`${segment}/instructions.md`;}
 else if(target==='test reference'){from='tests/main.test.mjs';to=`${segment}/test.mjs`;}
 else if(target==='documentation'){from='docs/functional guide.md';to=`${segment}/guide.md`;}
 else {const owner=target.startsWith('review')?f.report.review:f.report.security.checks[0];const receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));from=target.endsWith('source')?receipt.source.path:owner.evidence.path;to=`${segment}/proof.json`;}
 // Seed the physical lowercase Git directory; Windows case aliases resolve to it.
 const content=fs.readFileSync(path.join(f.root,from));put(f.root,to.replace(segment,'.git'),content);
 if(target==='report'||target==='context'){put(f.root,options.reportPath,JSON.stringify(f.report));if(target==='report'){put(f.root,to.replace(segment,'.git'),JSON.stringify(f.report));options.reportPath=to;}else{put(f.root,to.replace(segment,'.git'),fs.readFileSync(path.join(f.root,options.contextPath)));options.contextPath=to;}fail(await validateShipQuality(f.root,options));return;}
 if(target==='instructions')f.report.context.instructions[0]={path:to,sha256:sha(content)};
 else if(target==='test reference')f.report.changes[0].tests=[to];
 else if(target==='documentation'){f.report.documentation.guide=to;}
 else {const owner=target.startsWith('review')?f.report.review:f.report.security.checks[0];if(target.endsWith('receipt'))owner.evidence={path:to,sha256:sha(content)};else{const receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));receipt.source={path:to,sha256:sha(content)};owner.evidence=proof(f.root,owner.evidence.path,JSON.stringify(receipt));}}
 await reject(f);
});
test('AC-002 inventory excludes operational directory case aliases',async()=>{
 const root=newRoot();put(root,'src/a','product');const before=await capture(root);for(const name of ['.GIT/config','nested/.GiT/config','NODE_MODULES/pkg/a','.OMP/state/a'])put(root,name,'operational');assert.deepEqual(await capture(root),before);
});
for(const target of ['context','review receipt','review source','check receipt','check source','instructions']) for(const kind of ['hardlink','junction']) test(`AC-002 ${target} refuses ${kind} before following alias`,async()=>{
 const f=await fixture();const options=shipOptions(f);let ref;
 if(target==='context')ref={path:options.contextPath};else if(target==='instructions')ref=f.report.context.instructions[0];else{const owner=target.startsWith('review')?f.report.review:f.report.security.checks[0];ref=target.endsWith('receipt')?owner.evidence:JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8')).source;}
 // Give this object its own directory so the alias targets only this boundary.
 const isolated=`.omp/state/isolated-${target.replaceAll(' ','-')}/proof`;
 put(f.root,isolated,fs.readFileSync(path.join(f.root,ref.path)));
 if(target==='context')options.contextPath=isolated;
 else if(target==='instructions'){f.report.context.instructions[0].path=isolated;bindContext(f.root,f.report);}
 else {const owner=target.startsWith('review')?f.report.review:f.report.security.checks[0];if(target.endsWith('receipt'))owner.evidence.path=isolated;else{const receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));receipt.source.path=isolated;owner.evidence=proof(f.root,owner.evidence.path,JSON.stringify(receipt));}}
 saveReport(f);pass(await validate(f.root,f.report));pass(await validateShipQuality(f.root,options));
 const file=path.join(f.root,isolated);
 if(kind==='hardlink')fs.linkSync(file,path.join(f.root,'.omp/state/alias-'+target.replaceAll(' ','-')));
 else {const outside=newRoot(),dir=path.dirname(file),basename=path.basename(file);for(const entry of fs.readdirSync(dir))fs.copyFileSync(path.join(dir,entry),path.join(outside,entry));fs.renameSync(dir,dir+'-saved');fs.symlinkSync(outside,dir,'junction');}
 if(target==='context')fail(await validateShipQuality(f.root,options));else await reject(f,/link|alias|regular|source|instruction|evidence/i);
});
for(const kind of ['missing','malformed','same as report','same as receipt','divergent']) test(`AC-005 Ship independent context rejects ${kind}`,async()=>{
 const f=await fixture(),options=shipOptions(f);pass(await validateShipQuality(f.root,options));
 if(kind==='missing')delete options.contextPath;if(kind==='malformed')put(f.root,options.contextPath,'{broken');if(kind==='same as report')options.contextPath=options.reportPath;if(kind==='same as receipt')options.contextPath=f.report.review.evidence.path;if(kind==='divergent')put(f.root,options.contextPath,JSON.stringify({schema_version:1,context_digest:'0'.repeat(64)}));fail(await validateShipQuality(f.root,options));
});
for(const target of ['review','security']) test(`AC-004 receipt source cannot point to independent quality context: ${target}`,async()=>{
 const f=await fixture(),options=shipOptions(f),owner=target==='review'?f.report.review:f.report.security.checks[0];
 pass(await validate(f.root,f.report));
 pass(await validateShipQuality(f.root,options));
 pass(api.validateQualityReportFile(f.root,options.reportPath,options.contextPath));
 const expected=f.expectedContextDigest,receiptPath=owner.evidence.path;
 const receipt=JSON.parse(fs.readFileSync(path.join(f.root,receiptPath),'utf8'));
 const contextBytes=fs.readFileSync(path.join(f.root,options.contextPath));
 receipt.source={path:options.contextPath,sha256:sha(contextBytes)};
 const body=JSON.stringify(receipt);owner.evidence=proof(f.root,receiptPath,body);
 put(f.root,options.reportPath,JSON.stringify(f.report));
 assert.equal(f.expectedContextDigest,expected);
 assert.equal(receipt.context_digest,expected);
 assert.equal(owner.context_digest,expected);
 assert.equal(receipt.source.sha256,sha(contextBytes));
 fail(api.validateQualityReportFile(f.root,options.reportPath,options.contextPath));
 fail(await validateShipQuality(f.root,options));
});
for(const ownerKind of ['review','security']) test(`AC-004 receipt source cannot point to another receipt: ${ownerKind}`,async()=>{
 const f=await fixture(),options=shipOptions(f),owner=ownerKind==='review'?f.report.review:f.report.security.checks[0];
 pass(await validateShipQuality(f.root,options));
 pass(api.validateQualityReportFile(f.root,options.reportPath,options.contextPath));
 const other=ownerKind==='review'?f.report.security.checks[0]:f.report.review;
 const targetPath=other.evidence.path,targetBytes=fs.readFileSync(path.join(f.root,targetPath));
 const receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));
 receipt.source={path:targetPath,sha256:sha(targetBytes)};
 const body=JSON.stringify(receipt),receiptPath=owner.evidence.path;
 owner.evidence=proof(f.root,receiptPath,body);put(f.root,options.reportPath,JSON.stringify(f.report));
 assert.equal(f.expectedContextDigest,fixtureDigest(f.report));
 assert.equal(receipt.source.sha256,sha(targetBytes));
 fail(api.validateQualityReportFile(f.root,options.reportPath,options.contextPath));
 fail(await validateShipQuality(f.root,options));
});
test('AC-004 receipt source cannot point to the report artifact',async()=>{
 const f=await fixture(),options=shipOptions(f),owner=f.report.review;pass(await validate(f.root,f.report));pass(await validateShipQuality(f.root,options));
 const reportBytes=fs.readFileSync(path.join(f.root,options.reportPath));
 const receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));
 receipt.source={path:options.reportPath,sha256:sha(reportBytes)};
 owner.evidence=proof(f.root,owner.evidence.path,JSON.stringify(receipt));
 assert.equal(f.expectedContextDigest,fixtureDigest(f.report));
 const direct=api.validateQuality(f.root,f.report,{expectedContextDigest:f.expectedContextDigest});
 fail(direct);
});
for(const consumer of ['direct','file-validator','ship']) test(`AC-004 legitimate original JSON source wire is accepted by ${consumer} consumer`,async()=>{
 const f=await fixture(),owner=f.report.review,contextBytes=fs.readFileSync(path.join(f.root,'.omp/state/quality-context.json'));
 const installed=installOriginalJSONSource(f,owner,`review-${consumer}`,{tool:'static-analysis',fixture:'synthetic-quality-source',mode:'read-only'});
 assert.equal(Object.hasOwn(installed.original.source,'path'),false);
 assert.equal(Object.hasOwn(installed.original.source,'sha256'),false);
 assertOriginalJSONSourceHashes(f,owner,installed,contextBytes);
 if(consumer==='direct') pass(await validate(f.root,f.report));
 else {const options=shipOptions(f);if(consumer==='file-validator') pass(api.validateQualityReportFile(f.root,options.reportPath,options.contextPath));else pass(await validateShipQuality(f.root,options));}
});
for(const [label,sourceValue] of [['string metadata','static-analysis'],['null absence',null]]) test(`AC-004 legitimate original JSON source ${label} is not a proof reference`,async()=>{
 const f=await fixture(),owner=f.report.review,contextBytes=fs.readFileSync(path.join(f.root,'.omp/state/quality-context.json'));
 const installed=installOriginalJSONSource(f,owner,`review-${label.replaceAll(' ','-')}`,sourceValue);
 assert.equal(installed.original.function,'synthetic source metadata');
 assertOriginalJSONSourceHashes(f,owner,installed,contextBytes);
 pass(await validate(f.root,f.report));
});
for(const sourceKind of ['review','security']) test(`AC-004 receipt source with extra metadata remains rejected: ${sourceKind}`,async()=>{
 const f=await fixture(),sourceOwner=sourceKind==='review'?f.report.review:f.report.security.checks[0],consumer=sourceKind==='review'?f.report.security.checks[0]:f.report.review;
 const expected=f.expectedContextDigest,contextPath='.omp/state/quality-context.json',contextBytes=fs.readFileSync(path.join(f.root,contextPath));
 pass(await validate(f.root,f.report));
 const rawPath=sourceOwner.evidence.path,rawBytes=fs.readFileSync(path.join(f.root,rawPath)),rawReceipt=JSON.parse(rawBytes.toString('utf8'));
 assert.equal(sourceOwner.evidence.sha256,sha(rawBytes));
 assert.equal(rawReceipt.revision,f.report.revision);
 assert.equal(rawReceipt.context_digest,expected);
 assert.equal(typeof rawReceipt.source?.path,'string');
 assert.equal(rawReceipt.source.sha256,sha(fs.readFileSync(path.join(f.root,rawReceipt.source.path))));
 const sourcePath=`.omp/state/${sourceKind}-receipt-with-metadata.json`;
 rawReceipt.status='PASS';rawReceipt.note='Synthetic fixture metadata only; not an independent product result.';
 const sourceBody=JSON.stringify(rawReceipt);put(f.root,sourcePath,sourceBody);
 const consumerReceiptPath=consumer.evidence.path,consumerReceipt=JSON.parse(fs.readFileSync(path.join(f.root,consumerReceiptPath),'utf8'));
 consumerReceipt.source={path:sourcePath,sha256:sha(fs.readFileSync(path.join(f.root,sourcePath)))};
 const consumerBody=JSON.stringify(consumerReceipt);consumer.evidence=proof(f.root,consumerReceiptPath,consumerBody);
 assert.equal(consumerReceipt.source.sha256,sha(fs.readFileSync(path.join(f.root,sourcePath))));
 assert.equal(consumer.evidence.sha256,sha(fs.readFileSync(path.join(f.root,consumerReceiptPath))));
 assert.equal(fixtureDigest(f.report),expected,'Changing source/receipt bytes does not renew the independent context');
 assert.deepEqual(fs.readFileSync(path.join(f.root,contextPath)),contextBytes,'Independent context remains frozen');
 const result=await validate(f.root,f.report);fail(result);assert.match(result.errors.join(' '),/receipt|source|artifact/i);
});


test('AC-005 legacy default report presence cannot be bypassed by omitted reportPath',async()=>{
 const f=await fixture();saveReport(f);f.report.review.reviewer=f.report.review.author;saveReport(f);const result=await validateShipQuality(f.root,{required:false,contextPath:'.omp/state/quality-context.json'});fail(result);assert.equal(result.legacy,false);
});
for(const target of ['inventory','report']) test(`AC-002 deterministic identity swap refuses external read: ${target}`,async()=>{
 const f=await fixture(),options=shipOptions(f),outside=newRoot();const relative=target==='inventory'?'src/main.mjs':options.reportPath;
 const file=path.join(f.root,relative),dir=path.dirname(file);for(const entry of fs.readdirSync(dir))fs.copyFileSync(path.join(dir,entry),path.join(outside,entry));
 const originalReal=fs.realpathSync.bind(fs),originalStat=fs.lstatSync.bind(fs),originalRead=fs.readFileSync.bind(fs);let swapped=false,externalRead=false;
 const swap=()=>{if(swapped)return;swapped=true;fs.renameSync(dir,dir+'-before-swap');fs.symlinkSync(outside,dir,'junction');};
 if(target==='inventory')vi.spyOn(fs,'realpathSync').mockImplementation((p,...args)=>{const result=originalReal(p,...args);if(path.resolve(String(p))===file)swap();return result;});
 else vi.spyOn(fs,'lstatSync').mockImplementation((p,...args)=>{const result=originalStat(p,...args);if(path.resolve(String(p))===file)swap();return result;});
 vi.spyOn(fs,'readFileSync').mockImplementation((p,...args)=>{if(typeof p==='string'&&path.resolve(p)===file&&originalReal(p).startsWith(outside)){externalRead=true;throw Error('Synthetic guard prevented external content read');}return originalRead(p,...args);});
 syncBuiltinESMExports();
 if(target==='inventory')await assert.rejects(async()=>capture(f.root));else fail(await validateShipQuality(f.root,options));
 assert.equal(swapped,true,'Deterministic attack reached the preflight/use boundary');assert.equal(externalRead,false,'Unsafe read attempted after identity swap');
});

const qualityBin=fileURLToPath(new URL('../tdd-orchestrator/bin/quality.mjs',import.meta.url));
test('AC-005 CLI delivery without independent context cannot self-approve',async()=>{
 const f=await fixture(),reportPath=saveReport(f);const result=spawnSync(process.execPath,[qualityBin,'check',f.root,path.join(f.root,reportPath),'delivery'],{encoding:'utf8'});
 assert.equal(result.status,1,result.stdout+result.stderr);assert.match(result.stdout,/"ok"\s*:\s*false/);
});
for(const target of ['context','report']) for(const unsafe of ['../escape.json','.GIT/proof.json','alias/proof.json']) test(`AC-002 CLI safe ${target} rejects ${unsafe} with structured diagnostic`,async()=>{
 const f=await fixture(),options=shipOptions(f);let contextPath=options.contextPath,reportPath=options.reportPath;
 if(unsafe.startsWith('alias/')){const outside=newRoot();put(outside,'proof.json',JSON.stringify(target==='report'?f.report:{schema_version:1,context_digest:f.expectedContextDigest}));fs.symlinkSync(outside,path.join(f.root,'alias'),'junction');}
 else if(unsafe.startsWith('.GIT/'))put(f.root,unsafe,JSON.stringify(target==='report'?f.report:{schema_version:1,context_digest:f.expectedContextDigest}));
 if(target==='context')contextPath=unsafe;else reportPath=unsafe;
 const result=spawnSync(process.execPath,[qualityBin,'check',f.root,reportPath,'delivery','--quality-context',contextPath],{encoding:'utf8'});assert.equal(result.status,1);const output=result.stdout+result.stderr;assert.match(output,/"ok"\s*:\s*false/,'Validation errors must retain structured CLI output');assert.doesNotMatch(output,/usage:/,'The safe-path consumer must parse --quality-context before validating paths');
});

for(const field of ['author','reviewer']) test(`AC-005 receipt ${field} must match independent report identity`,async()=>{
 const f=await fixture(),evidence=f.report.review.evidence,receipt=JSON.parse(fs.readFileSync(path.join(f.root,evidence.path),'utf8'));receipt[field]='unreviewed-identity';f.report.review.evidence=proof(f.root,evidence.path,JSON.stringify(receipt));await reject(f,/receipt|author|reviewer|identity|evidence/i);
});
for(const target of ['review source','check source','instructions']) for(const unsafe of ['../external','/absolute','C:\\external\\file','a/../../outside']) test(`AC-002 ${target} refuses unsafe path ${unsafe}`,async()=>{
 const f=await fixture();if(target==='instructions')f.report.context.instructions[0].path=unsafe;
 else{const owner=target==='review source'?f.report.review:f.report.security.checks[0],receipt=JSON.parse(fs.readFileSync(path.join(f.root,owner.evidence.path),'utf8'));receipt.source.path=unsafe;owner.evidence=proof(f.root,owner.evidence.path,JSON.stringify(receipt));}await reject(f);
});
test('AC-003 independent expected binds documentation role mapping',async()=>{
 const f=await fixture();f.report.documentation.guide='README.md';bindContext(f.root,f.report,{approve:false});await reject(f,/context/i);
});
test('AC-005 planning without contextual criteria fails even with a fresh baseline',async()=>{
 const f=await fixture();const plan={schema_version:1,baseline:capture(f.root),security:{risk:'low',rationale:'Synthetic local fixture'},context:fullContext(f.root),plan:{documentation:'Update functional docs',security:'Inspect dependencies and secrets',review:'Independent review of delivery'}};
 pass(await api.validateQuality(f.root,plan,{stage:'planning'}));delete plan.context.criteria;fail(await api.validateQuality(f.root,plan,{stage:'planning'}));
});

// T-002-proof-closure / attempt 2: BOM must not disguise a JSON source edge.
for(const target of ['review','check']) for(const depth of ['direct','nested']) test(`AC-004 proof-closure rejects BOM-hidden ${depth} source cycle for ${target}`,async()=>{
 const f=await fixture();const expected=approved.get(f.report),owner=target==='review'?f.report.review:f.report.security.checks[0];
 const evidencePath=owner.evidence.path;
 const receipt=JSON.parse(fs.readFileSync(path.join(f.root,evidencePath),'utf8'));
 const sourcePath=receipt.source.path,nestedPath=`.omp/state/${target}-cycle-node.json`;
 const leaf=proof(f.root,`.omp/state/${target}-cycle-control.txt`,'Synthetic original acyclic leaf.');
 const install=(body)=>{
  if(depth==='direct')receipt.source=proof(f.root,sourcePath,body);
  else {const child=proof(f.root,nestedPath,body);receipt.source=proof(f.root,sourcePath,JSON.stringify({source:child}));}
  owner.evidence=proof(f.root,evidencePath,JSON.stringify(receipt));
  assert.equal(fixtureDigest(f.report),expected,'Source graph changes do not alter canonical decisions');
  assert.equal(approved.get(f.report),expected,'The trusted expected context is not refreshed');
 };
 // A valid BOM JSON graph must remain accepted, including a nested source node.
 install('\uFEFF'+JSON.stringify({source:leaf}));
 pass(await validate(f.root,f.report));
 const cyclePath=depth==='direct'?sourcePath:nestedPath;
 const cyclicJSON=JSON.stringify({source:{path:cyclePath,sha256:'0'.repeat(64)}});
 install(cyclicJSON);const plain=await validate(f.root,f.report);fail(plain);assert.match(plain.errors.join(' '),/source cycle/i);
 install('\uFEFF'+cyclicJSON);const bom=await validate(f.root,f.report);
 assert.equal(bom.ok,false,`BOM-hidden ${depth} ${target} source cycle was accepted`);assert.match(bom.errors.join(' '),/source cycle/i);
});

// T-002-document-navigation / attempt 3, AC-003 / CAP-023 / IR-003 P2.
// Selectively adapted from the read-only OpenBot-Skill-Workflow navigation corpus.
// Bounded inline Markdown navigation policy (32 levels / 8192-character tokens),
// not full CommonMark, HTML visibility, CSS or browser-conformance certification.
async function navigationFixture(readme,document='docs/guide.md') {
 const root=newRoot();
 put(root,'README.md',readme);put(root,document,'# Synthetic current catalog, specification, guide and history.');
 put(root,'src/main.mjs','export const answer=1;');
 const context=fullContext(root);context.run_id='synthetic-document-navigation';context.purpose='Synthetic real README navigation contract';
 // Each complete README is constructed before baseline/revision and approval.
 const baseline=await capture(root),revision=baseline.digest;
 const report={schema_version:1,baseline,revision,context,changes:[],documentation:Object.fromEntries(roles.map(role=>[role,document])),
  security:{risk:'low',rationale:'Synthetic local navigation fixture, no external data',checks:['secrets','dependencies'].map(id=>({id,status:'PASS',method:'Synthetic bounded fixture inspection',revision})),findings:[]},
  review:{author:'synthetic-navigation-author',reviewer:'synthetic-navigation-peer',independent:true,revision,documentation_current:true,security_reviewed:true}};
 bindContext(root,report);
 const expectedContextDigest=approved.get(report),reportPath='.omp/state/quality.json',contextPath='.omp/state/quality-context.json';
 put(root,reportPath,JSON.stringify(report));
 assert.equal((await capture(root)).digest,revision,'README construction precedes final inventory and approval');
 assert.equal(fixtureDigest(report),expectedContextDigest,'Expected context is complete and approved independently before validation');
 for(const owner of [report.review,...report.security.checks]){
  const receiptBytes=fs.readFileSync(path.join(root,owner.evidence.path));assert.equal(sha(receiptBytes),owner.evidence.sha256);
  const receipt=JSON.parse(receiptBytes);assert.equal(receipt.context_digest,expectedContextDigest);assert.equal(sha(fs.readFileSync(path.join(root,receipt.source.path))),receipt.source.sha256);
 }
 // Evaluate both consumers before asserting, so a RED contains evidence for both.
 const direct=await api.validateQuality(root,report,{expectedContextDigest});
 const ship=await validateShipQuality(root,{required:true,reportPath,contextPath});
 return {direct,ship};
}
async function assertNavigation(readme,expected,document='docs/guide.md') {
 if(!expected){const control=await navigationFixture(`[Guide](<${document}>)`,document);assert.deepEqual({direct:control.direct.ok,ship:control.ship.ok},{direct:true,ship:true},'Real link positive control must pass with the same document');}
 const result=await navigationFixture(readme,document);
 assert.deepEqual({direct:result.direct.ok,ship:result.ship.ok},{direct:expected,ship:expected},JSON.stringify({directErrors:result.direct.errors,shipErrors:result.ship.errors}));
 if(!expected)for(const output of [result.direct,result.ship]){
  assert.ok(output.errors.length>0,'Navigation refusal requires diagnostics');
  assert.ok(output.errors.every(error=>/README.*(?:link|Markdown|parser|token|nest|budget)|(?:Markdown|inline|container).*(?:limit|budget|nest)/i.test(error)),`Reject for navigation/parser bounds only: ${JSON.stringify(output.errors)}`);
 }
}
const navigationLink='[Guide](docs/guide.md)';
const navigationInvalidCases=[
 ['no link','# Synthetic documentation without navigation'],
 ['backtick fence',`\`\`\`md\n${navigationLink}\n\`\`\``],
 ['tilde fence',`~~~markdown\n${navigationLink}\n~~~`],
 ['short closer cannot end longer fence',`\`\`\`\`md\n\`\`\`\n${navigationLink}\n\`\`\`\n\`\`\`\``],
 ['quote fence',`> ~~~md\n> ${navigationLink}\n> ~~~`],
 ['list fence',`- ~~~md\n  ${navigationLink}\n  ~~~`],
 ['nested container fence',`> - ~~~md\n>   ${navigationLink}\n>   ~~~`],
 ['indented code',`    ${navigationLink}`],
 ['tab code',`\t${navigationLink}`],
 ['indented code after paragraph',`Docs:\n\n    ${navigationLink}`],
 ['quote indented code',`>     ${navigationLink}`],
 ['list indented code',`- Docs:\n\n      ${navigationLink}`],
 ['inline code',`\`${navigationLink}\``],
 ['double backtick span',`\`\`${navigationLink}\`\``],
 ['multiline code span',`\`example\n${navigationLink}\nexample\``],
 ['lazy nested code span',`> - \`example\n${navigationLink}\n>   ending\``],
 ['HTML comment',`<!-- ${navigationLink} -->`],
 ['multiline HTML comment',`<!--\n${navigationLink}\n-->`],
 ['comment block keeps same-line suffix literal',`<!-- example -->${navigationLink}`],
 ['pre raw block',`<pre>\n${navigationLink}\n</pre>`],
 ['div raw block',`<div>\n${navigationLink}\n</div>`],
 ['HTML block ends at blank rather than closing tag',`<div>\n</div>\n${navigationLink}`],
 ['quoted HTML block',`> <div>\n> ${navigationLink}\n> </div>`],
 ['HTML attribute with greater-than',`Docs <span title="> ${navigationLink}">info</span>`],
 ['multiline HTML attribute',`Docs <span\n title="${navigationLink}">info</span>`],
 ['processing instruction',`Docs <?target ${navigationLink} ?>`],
 ['CDATA',`Docs <![CDATA[ ${navigationLink} ]]>`],
 ['URI autolink body',`Docs <https://example.test/${navigationLink}>`],
 ['image',`!${navigationLink}`],
 ['image alt containing nested link',`![<span title="]"> ${navigationLink}](picture.png)`],
 ['escaped opening bracket',`\\${navigationLink}`],
 ['escaped parenthesis','[Guide]\\(docs/guide.md)'],
 ['label cannot cross blank paragraph','[Guide\n\n](docs/guide.md)'],
 ['destination cannot cross blank paragraph','[Guide](\n\ndocs/guide.md)'],
 ['malformed URI escape','[Guide](docs/%ZZguide.md)'],
 ['encoded separator cannot establish coverage','[Guide](docs%2fguide.md)'],
 ['unterminated title','[Guide](docs/guide.md "unfinished)'],
 ['missing angle closer','[Guide](<docs/guide.md)'],
 ['oversized image alt cannot expose suffix','!['+'x'.repeat(8200)+navigationLink+'](picture.png)'],
 ['overdeep image alt cannot expose suffix','!['+'['.repeat(40)+navigationLink+']'.repeat(40)+'](picture.png)'],
 ['oversized image destination cannot expose suffix','![alt](picture-'+'x'.repeat(8200)+navigationLink+'.png)'],
 ['oversized attribute cannot expose suffix','Docs <span title="'+'x'.repeat(8200)+navigationLink+'">info</span>'],
 ['oversized comment cannot expose suffix','Docs <!-- '+'x'.repeat(8200)+navigationLink+' -->'],
 ['overdeep containers do not satisfy navigation','> '.repeat(33)+navigationLink],
 ['overlong link candidate cannot satisfy navigation','['+'x'.repeat(8200)+'](docs/guide.md)'],
 ['overdeep label cannot satisfy navigation','['.repeat(33)+'Guide'+']'.repeat(33)+'(docs/guide.md)']
];
for(const tag of ['script','style','textarea','title','xmp','iframe','noembed','noframes','noscript'])navigationInvalidCases.push([`${tag} literal body across paragraphs`,`Docs <${tag}>hidden\n\n${navigationLink}\n\n</${tag}>`]);
navigationInvalidCases.push(['unclosed script remains literal',`Docs <script>unclosed\n\n${navigationLink}`],['plaintext apparent closer stays literal',`Docs <plaintext>hidden</plaintext>${navigationLink}`]);
for(const [label,readme] of navigationInvalidCases)test(`AC-003 document-navigation rejects ${label}`,async()=>{await assertNavigation(readme,false);});
const navigationValidCases=[
 ['ordinary prose',navigationLink],
 ['heading',`## ${navigationLink}`],
 ['angle literal space','[Guide](<docs/User Guide.md>)','docs/User Guide.md'],
 ['URI encoded space and fragment','[Guide](docs/User%20Guide.md#usage)','docs/User Guide.md'],
 ['angle URI encoded space','[Guide](<docs/User%20Guide.md#usage>)','docs/User Guide.md'],
 ['balanced parentheses','[Guide](docs/User(Guide).md)','docs/User(Guide).md'],
 ['escaped parentheses','[Guide](docs/User\\(Guide\\).md)','docs/User(Guide).md'],
 ['quoted title','[Guide](docs/guide.md "Usage title")'],
 ['parenthesized title','[Guide](docs/guide.md (Usage title))'],
 ['angle filename resembles tag','[Guide](<Guide>)','Guide'],
 ['blockquote prose',`> ${navigationLink}`],
 ['list paragraph continuation',`- Documentation\n    ${navigationLink}`],
 ['paragraph continuation indentation',`Docs:\n    ${navigationLink}`],
 ['lazy quote continuation',`> Docs:\n${navigationLink}`],
 ['nested container prose',`> - Docs:\n>     ${navigationLink}`],
 ['adjacent inline code',`\`example\` ${navigationLink}`],
 ['adjacent comment within prose',`Docs <!-- example -->${navigationLink}`],
 ['after closed fence',`\`\`\`md\nignored\n\`\`\`\n${navigationLink}`],
 ['after container fence boundary',`> ~~~md\n> example\n${navigationLink}`],
 ['adjacent image',`![picture](elsewhere.png) ${navigationLink}`],
 ['escaped image marker',`\\!${navigationLink}`],
 ['image inside real link','[![Picture](elsewhere.png)](docs/guide.md)'],
 ['visible inline span body',`Docs <span>${navigationLink}</span>`],
 ['after closed literal element',`Docs <script>hidden</script>${navigationLink}`],
 ['after HTML block blank line',`<div>\nexample\n\n${navigationLink}`],
 ['literal script example does not hide following link',`\`<script>\` ${navigationLink}`],
 ['invalid inline tag remains prose',`Docs <span bad*="${navigationLink}">`],
 ['unmatched code delimiter cannot span blank paragraphs',`\`example\n\n${navigationLink}\n\nexample\``],
 ['32 container levels retain lazy prose','> '.repeat(32)+'Documentation\n'+navigationLink],
 ['bounded nested image keeps adjacent real link','!['+'['.repeat(30)+'example'+']'.repeat(30)+'](picture.png) '+navigationLink],
 ['32 label levels','['.repeat(32)+'Guide'+']'.repeat(32)+'(docs/guide.md)'],
 ['exact token limit retains adjacent real link','Docs <span title="'+'x'.repeat(8192-'<span title="'.length-'">'.length)+'">text</span>'+navigationLink]
];
for(const [label,readme,document] of navigationValidCases)test(`AC-003 document-navigation accepts ${label}`,async()=>{await assertNavigation(readme,true,document);});
