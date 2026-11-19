import {test, afterEach} from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateQuality} from '../tdd-orchestrator/lib/quality.mjs';
import {triageRetro, validateRetro} from '../retro/lib/control.mjs';

// All projects, identities and reviews below are synthetic, never claims about this run.
// Fixture hashes/context are independent of production capture/digest implementations.
const home=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../.test-temp');
const roots=[];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const jsonHash=v=>hash(JSON.stringify(canonical(v)));
const clone=v=>structuredClone(v);
function root(){fs.mkdirSync(home,{recursive:true});const r=fs.mkdtempSync(path.join(home,'retro-'));roots.push(r);return r;}
afterEach(()=>{for(const r of roots.splice(0))fs.rmSync(r,{recursive:true,force:true});});
function put(r,p,b){fs.mkdirSync(path.dirname(path.join(r,p)),{recursive:true});fs.writeFileSync(path.join(r,p),b);}
function proof(r,p,b='Synthetic independent observation.'){put(r,p,b);return {path:p,sha256:hash(b)};}
function inventory(r){const files={};function walk(d,rel=''){for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:1)){if(['.omp','.git','node_modules'].includes(e.name.toLowerCase()))continue;const p=rel?`${rel}/${e.name}`:e.name;if(e.isDirectory())walk(path.join(d,e.name),p);else files[p]=hash(fs.readFileSync(path.join(d,e.name)));}}walk(r);return {files,digest:hash(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0))))};}
function digest(q){const omit=v=>Object.fromEntries(Object.entries(v).filter(([k])=>!['evidence','context_digest'].includes(k)));return jsonHash({schema_version:q.schema_version,baseline:{digest:q.baseline.digest},revision:q.revision,context:q.context,changes:q.changes,documentation:q.documentation,security:{...q.security,checks:q.security.checks.map(omit),findings:q.security.findings.map(omit)},review:omit(q.review)});}
function fixture(){
 const r=root();put(r,'src/main.mjs','export const answer=1;\n');put(r,'tests/main.test.mjs','// synthetic acceptance source\n');
 put(r,'docs/guide.md','# Feature\nF-001 AC-009 returns one. Usage: answer. History: initial.\n');
 put(r,'README.md','[catalog](docs/guide.md)\n[specification](docs/guide.md)\n[guide](docs/guide.md)\n[history](docs/guide.md)\n');
 const baseline=inventory(r);put(r,'src/main.mjs','export const answer=2;\n');put(r,'docs/guide.md','# Feature\nF-001 AC-009 returns two. Usage: answer. History: changed from one to two.\n');
 const revision=inventory(r).digest;
 const instructions=proof(r,'.omp/state/instructions.md','Synthetic authorized source: inspect current delivery.');
 const q={schema_version:1,baseline,revision,context:{run_id:'synthetic-retro-run',criteria:[{id:'AC-009',description:'Retrospective decisions revalidate current delivery.',type:'behavioral'}],environment:{runtime:process.version,platform:process.platform},purpose:'Synthetic retro contract fixture',instructions:[instructions]},
 changes:[{path:'src/main.mjs',impact:'functional',reason:'Answer changes',features:['F-001'],acceptance:['AC-009'],tests:['tests/main.test.mjs'],docs:['docs/guide.md']},{path:'docs/guide.md',impact:'none',reason:'Document answer behavior',features:[],acceptance:[],tests:[],docs:[]}],
 documentation:Object.fromEntries(['catalog','specification','guide','history'].map(k=>[k,'docs/guide.md'])),
 security:{risk:'low',rationale:'Local fixture without network or private data',checks:['secrets','dependencies'].map(id=>({id,status:'PASS',method:'Synthetic independent inspection',revision})),findings:[]},
 review:{author:'synthetic-author',reviewer:'synthetic-independent-peer',independent:true,revision,documentation_current:true,security_reviewed:true}};
 const expected=digest(q);
 const source=proof(r,'.omp/state/review-source.txt');q.review.context_digest=expected;q.review.evidence=proof(r,'.omp/state/review.json',JSON.stringify({author:q.review.author,reviewer:q.review.reviewer,revision,context_digest:expected,source}));
 for(const c of q.security.checks){c.context_digest=expected;const source=proof(r,`.omp/state/${c.id}-source.txt`);c.evidence=proof(r,`.omp/state/${c.id}.json`,JSON.stringify({revision,context_digest:expected,source}));}
 put(r,'.omp/state/delivery.json',JSON.stringify(q));
 const evidence=proof(r,'.omp/state/episode.txt','Synthetic failure repeated twice; diagnosis is a hypothesis.');
 const input={run_id:q.context.run_id,delivery_report:'.omp/state/delivery.json',route:'full',reason:'Synthetic full route',evidence:[evidence],expectedContextDigest:expected,requested:false,opt_out:false,first_pilot:false,significant_failure:false,significant_rework:false,user_unblock:false};
 const report={run_id:input.run_id,delivery_revision:revision,status:'COMPLETE',sources:[evidence],findings:[],proposals:[],limitations:[],next_action:'nenhuma ação proposta'};
 // Setup failure here is explicitly not a retro behavioral RED.
 const gate=validateQuality(r,q,{stage:'delivery',expectedContextDigest:expected});assert.equal(gate.ok,true,`QUALITY_FIXTURE_SETUP: ${JSON.stringify(gate.errors)}`);
 return {r,q,input,report,evidence,expected};
}
const complete=d=>{assert.equal(d.decision_status,'COMPLETE');assert.equal(d.delivery_status,'PASS');assert.deepEqual(d.errors,[]);};
const incomplete=d=>{assert.equal(d.decision_status,'INCOMPLETE');assert.equal(d.delivery_status,'UNKNOWN');assert.equal(d.required,null);assert.ok(Array.isArray(d.errors)&&d.errors.length>0);};
const pass=v=>{assert.equal(v.ok,true,JSON.stringify(v.errors));assert.deepEqual(v.errors,[]);};
const fail=v=>{assert.equal(v.ok,false);assert.ok(Array.isArray(v.errors)&&v.errors.length>0);};
const tri=f=>triageRetro(f.r,f.input);
const val=(f,d=tri(f),report=f.report,options={expectedContextDigest:f.expected})=>validateRetro(f.r,d,report,options);
function save(f){put(f.r,f.input.delivery_report,JSON.stringify(f.q));}

test('AC-009 full delivery yields exact COMPLETE decision and empty analysis passes',()=>{const f=fixture(),d=tri(f);assert.deepEqual(Object.keys(d).sort(),['schema_version','run_id','delivery_revision','delivery_report','context_digest','opt_out','delivery_status','decision_status','required','triggers','reason','evidence','errors'].sort());complete(d);assert.equal(d.schema_version,1);assert.equal(d.required,true);assert.equal(d.opt_out,false);assert.equal(d.run_id,f.input.run_id);assert.equal(d.delivery_report,f.input.delivery_report);assert.equal(d.delivery_revision,f.q.revision);assert.equal(d.context_digest,f.expected);assert.deepEqual(d.triggers,['full']);assert.deepEqual(d.evidence,[f.evidence]);assert.ok(d.reason.trim());pass(val(f,d));});
test('AC-009 short route without triggers is genuine dispensation and never validates analysis',()=>{const f=fixture();f.input.route='short';const d=tri(f);complete(d);assert.equal(d.required,false);assert.deepEqual(d.triggers,[]);fail(val(f,d));});
for(const flag of ['requested','first_pilot','significant_failure','significant_rework','user_unblock'])test(`AC-009 short route ${flag} alone requires analysis`,()=>{const f=fixture();f.input.route='short';f.input[flag]=true;const d=tri(f);complete(d);assert.equal(d.required,true);assert.deepEqual(d.triggers,[flag]);pass(val(f,d));});
test('AC-009 repeated failure user request and all triggers are unique in canonical order',()=>{const f=fixture();for(const k of ['requested','first_pilot','significant_failure','significant_rework','user_unblock'])f.input[k]=true;assert.deepEqual(tri(f).triggers,['full','requested','first_pilot','significant_failure','significant_rework','user_unblock']);});
test('AC-009 opt out retains triggers and takes precedence over explicit request',()=>{const f=fixture();f.input.requested=true;f.input.opt_out=true;const d=tri(f);complete(d);assert.equal(d.required,false);assert.equal(d.opt_out,true);assert.deepEqual(d.triggers,['full','requested']);fail(val(f,d));});
for(const flag of ['requested','opt_out','first_pilot','significant_failure','significant_rework','user_unblock'])for(const invalid of [undefined,null,0,'false',{},[]])test(`AC-009 strict ${flag} rejects ${JSON.stringify(invalid)}`,()=>{const f=fixture();if(invalid===undefined)delete f.input[flag];else f.input[flag]=invalid;const d=tri(f);incomplete(d);assert.equal(d.opt_out,flag==='opt_out'?null:false);});
for(const [label,mutate] of [
 ['extra input key',f=>f.input.command='echo malicious'],['bad route',f=>f.input.route='automatic'],['blank reason',f=>f.input.reason=' '],['missing evidence',f=>delete f.input.evidence],['empty evidence',f=>f.input.evidence=[]],['bad expected digest',f=>f.input.expectedContextDigest='x'],['absent expected digest',f=>delete f.input.expectedContextDigest],['different trusted context',f=>f.input.expectedContextDigest='0'.repeat(64)],['wrong run',f=>f.input.run_id='other-run'],['stale inventory',f=>put(f.r,'src/main.mjs','changed after delivery')],['stale evidence',f=>put(f.r,f.evidence.path,'rewritten')],['stale review source',f=>put(f.r,'.omp/state/review-source.txt','rewritten')],['non independent review',f=>{f.q.review.reviewer=f.q.review.author;save(f);}],['invalid delivery JSON',f=>put(f.r,f.input.delivery_report,'{')],['missing delivery',f=>fs.unlinkSync(path.join(f.r,f.input.delivery_report))],['directory delivery',f=>{fs.unlinkSync(path.join(f.r,f.input.delivery_report));fs.mkdirSync(path.join(f.r,f.input.delivery_report));}],
])test(`AC-009 triage incomplete for ${label}`,()=>{const f=fixture();mutate(f);incomplete(tri(f));});
test('AC-009 missing delivery with opt out remains unknown and preserves opt out',()=>{const f=fixture();f.input.opt_out=true;fs.unlinkSync(path.join(f.r,f.input.delivery_report));const d=tri(f);incomplete(d);assert.equal(d.opt_out,true);});
for(const [field,value]of [['run_id',' '],['run_id',null],['delivery_report','../escape'],['delivery_report','C:/escape'],['delivery_report','.git/config']])test(`AC-009 unsafe diagnostic ${field} ${JSON.stringify(value)} is null`,()=>{const f=fixture();f.input[field]=value;const d=tri(f);incomplete(d);assert.equal(d[field],null);});
for(const p of ['../escape','.git/config','.GIT/config','nested/.git/config','C:/outside','/outside','a\\b','a//b','./a','a/../b','a:b','a\nfile'])test(`AC-009 rejects unsafe proof path ${JSON.stringify(p)}`,()=>{const f=fixture();f.input.evidence=[{path:p,sha256:f.evidence.sha256}];incomplete(tri(f));});
for(const field of ['evidence','sources'])test(`AC-009 ${field} hash must be lowercase exact SHA256`,()=>{const f=fixture();if(field==='evidence'){f.input.evidence=[{...f.evidence,sha256:f.evidence.sha256.toUpperCase()}];incomplete(tri(f));}else{f.report.sources=[{...f.evidence,sha256:'0'.repeat(64)}];fail(val(f));}});
for(const kind of ['hardlink','junction','symlink'])test(`AC-009 safe reads refuse real ${kind} evidence`,context=>{const f=fixture(),outside=root();put(outside,'proof.txt','external fixture');let p='.omp/state/alias.txt';if(kind==='hardlink')fs.linkSync(path.join(outside,'proof.txt'),path.join(f.r,p));else if(kind==='junction'){p='.omp/alias/proof.txt';fs.symlinkSync(outside,path.join(f.r,'.omp/alias'),'junction');}else{try{fs.symlinkSync(path.join(outside,'proof.txt'),path.join(f.r,p),'file');}catch(e){if(e.code==='EPERM'){context.skip('Symbolic-link privilege unavailable; junction/hardlink still run');return;}throw e;}}f.input.evidence=[{path:p,sha256:hash('external fixture')}];incomplete(tri(f));});
test('AC-009 delivery report alias is refused despite valid target bytes',()=>{const f=fixture();fs.linkSync(path.join(f.r,f.input.delivery_report),path.join(f.r,'.omp/state/alias.json'));f.input.delivery_report='.omp/state/alias.json';incomplete(tri(f));});
test('AC-009 root junction is refused',()=>{const f=fixture(),holder=root();fs.symlinkSync(f.r,path.join(holder,'alias'),'junction');incomplete(triageRetro(path.join(holder,'alias'),f.input));});

test('AC-009 all categories and three proposal priorities validate',()=>{const f=fixture();f.report.findings=['product','environment','instruction','execution'].map(category=>({category,evidence:[f.evidence],consequence:'Synthetic delay',cause:'Hypothesis: missing guard',recurrence:'Observed twice in fixture'}));f.report.proposals=['high','medium','low'].map((priority,i)=>({id:`P-${i}`,evidence:[f.evidence],action:'Propose a regression guard',priority,success_criterion:'Repeated fixture is rejected before delivery'}));pass(val(f));});
for(const [label,mutate]of [
 ['report incomplete',r=>r.status='INCOMPLETE'],['wrong run',r=>r.run_id='other'],['stale revision',r=>r.delivery_revision='0'.repeat(64)],['missing sources',r=>r.sources=[]],['extra report field',r=>r.command='echo malicious'],['blank next action',r=>r.next_action=' '],['invalid limitations',r=>r.limitations=[42]],['blank limitation',r=>r.limitations=[' ']],['missing findings',r=>delete r.findings],['unknown status',r=>r.status='PASS'],
])test(`AC-009 analysis rejects ${label}`,()=>{const f=fixture();mutate(f.report);fail(val(f));});
const finding=e=>({category:'execution',evidence:[e],consequence:'Synthetic rework',cause:'Hypothesis requiring further observation'});
for(const [label,mutate]of [['category',v=>v.category='security'],['evidence',v=>v.evidence=[]],['consequence',v=>v.consequence=' '],['cause',v=>v.cause=''],['recurrence',v=>v.recurrence=null],['extra key',v=>v.severity='high']])test(`AC-009 finding rejects invalid ${label}`,()=>{const f=fixture(),v=finding(f.evidence);mutate(v);f.report.findings=[v];fail(val(f));});
test('AC-009 finding recurrence is optional',()=>{const f=fixture();f.report.findings=[finding(f.evidence)];pass(val(f));});
const proposal=e=>({id:'P-1',evidence:[e],action:'Propose a local guard',priority:'medium',success_criterion:'Observed recurrence decreases'});
for(const [label,mutate]of [['priority',v=>v.priority='urgent'],['evidence',v=>v.evidence=[]],['id',v=>v.id=' '],['action',v=>v.action=''],['success criterion',v=>v.success_criterion=' '],['extra key',v=>v.execute=true]])test(`AC-009 proposal rejects invalid ${label}`,()=>{const f=fixture(),v=proposal(f.evidence);mutate(v);f.report.proposals=[v];fail(val(f));});
test('AC-009 four proposals and duplicate IDs fail',()=>{const f=fixture();f.report.proposals=Array.from({length:4},(_,i)=>({...proposal(f.evidence),id:`P-${i}`}));fail(val(f));f.report.proposals=[proposal(f.evidence),proposal(f.evidence)];fail(val(f));});
for(const kind of ['source','finding','proposal'])test(`AC-009 current ${kind} proof revalidated after decision`,()=>{const f=fixture(),d=tri(f);const e=proof(f.r,`.omp/state/${kind}-late.txt`);if(kind==='source')f.report.sources=[e];if(kind==='finding')f.report.findings=[{...finding(e)}];if(kind==='proposal')f.report.proposals=[proposal(e)];put(f.r,e.path,'stale now');fail(val(f,d));});
for(const [label,mutate]of [['required false',d=>d.required=false],['incomplete',d=>{d.decision_status='INCOMPLETE';d.delivery_status='UNKNOWN';d.required=null;}],['wrong run',d=>d.run_id='other'],['stale revision',d=>d.delivery_revision='0'.repeat(64)],['stale context',d=>d.context_digest='0'.repeat(64)],['extra key',d=>d.approved=true],['duplicate triggers',d=>d.triggers=['full','full']],['unknown trigger',d=>d.triggers=['repeated_failure']]])test(`AC-009 analysis rejects decision ${label}`,()=>{const f=fixture(),d=tri(f);mutate(d);fail(val(f,d));});
for(const options of [undefined,{},null,{expectedContextDigest:'0'.repeat(64)},{expectedContextDigest:'invalid'},{expectedContextDigest:null}])test(`AC-009 validation options fail closed ${JSON.stringify(options)}`,()=>{const f=fixture(),d=tri(f);fail(validateRetro(f.r,d,f.report,options));});
test('AC-009 validation reopens current delivery and native review source',()=>{const f=fixture(),d=tri(f);put(f.r,'.omp/state/review-source.txt','source replaced after triage');fail(val(f,d));});
test('AC-009 validation refuses newly changed product after decision',()=>{const f=fixture(),d=tri(f);put(f.r,'src/new.mjs','new product file');fail(val(f,d));});
test('AC-009 validation does not infer context from rewritten report',()=>{const f=fixture(),d=tri(f);f.q.context.environment.mode='changed';save(f);fail(val(f,d));});
test('AC-009 null and malformed top level data return diagnostics',()=>{const f=fixture();for(const bad of [null,undefined,[],true,'command']){incomplete(triageRetro(f.r,bad));fail(validateRetro(f.r,bad,f.report,{expectedContextDigest:f.expected}));fail(validateRetro(f.r,tri(f),bad,{expectedContextDigest:f.expected}));}});
function tree(r){const files={};function walk(d,p=''){for(const e of fs.readdirSync(d,{withFileTypes:true})){const rel=p?`${p}/${e.name}`:e.name;if(e.isDirectory())walk(path.join(d,e.name),rel);else files[rel]=hash(fs.readFileSync(path.join(d,e.name)));}}walk(r);return files;}
test('AC-009 command text stays data APIs leave filesystem and arguments unchanged',()=>{const f=fixture();f.input.reason='node --eval "throw Error(123)"';f.report.next_action='node --eval "throw Error(456)"';f.report.proposals=[{...proposal(f.evidence),action:'node --eval "throw Error(789)"'}];const before=tree(f.r),input=clone(f.input),report=clone(f.report);const d=tri(f),decision=clone(d);complete(d);pass(val(f,d));assert.deepEqual(tree(f.r),before);assert.deepEqual(f.input,input);assert.deepEqual(f.report,report);assert.deepEqual(d,decision);});

// RED_REVISION: ordinary passive Array subclasses are outside the closed JSON boundary.
// This subclass has no custom methods, accessors, callbacks or iterator.
class PlainSubclass extends Array {}
const passiveArrayCases = [
 ['input evidence', (f,d) => [f.input,'evidence']],
 ['decision evidence', (f,d) => [d,'evidence']],
 ['decision triggers', (f,d) => [d,'triggers']],
 ['decision errors', (f,d) => [d,'errors']],
 ['report sources', (f,d) => [f.report,'sources']],
 ['report findings', (f,d) => [f.report,'findings']],
 ['report proposals', (f,d) => [f.report,'proposals']],
 ['report limitations', (f,d) => [f.report,'limitations']],
 ['finding evidence', (f,d) => [f.report.findings[0],'evidence']],
 ['proposal evidence', (f,d) => [f.report.proposals[0],'evidence']],
];
for (const [label, locate] of passiveArrayCases) {
 for (const subclass of [false,true]) {
  test(`AC-009 passive JSON array boundary ${label} ${subclass?'refuses PlainSubclass':'accepts ordinary Array'}`, () => {
   const f=fixture();
   f.report.findings=[finding(f.evidence)];
   f.report.proposals=[proposal(f.evidence)];
   f.report.limitations=['Synthetic observation only'];
   const d=tri(f);complete(d);
   const [owner,key]=locate(f,d),original=owner[key];
   owner[key]=subclass?new PlainSubclass(...original):[...original];
   assert.equal(JSON.stringify(owner[key]),JSON.stringify(original),'Array content remains identical');
   assert.equal(Object.getPrototypeOf(owner[key]),subclass?PlainSubclass.prototype:Array.prototype);
   if(label==='input evidence') {
    const result=tri(f);
    if(subclass) {
     assert.equal(result.decision_status,'INCOMPLETE','Closed JSON boundary must refuse passive Array subclass');
     incomplete(result);
    } else {complete(result);pass(val(f,result));}
   } else {
    const result=val(f,d);
    if(subclass) {
     assert.equal(result.ok,false,'Closed JSON boundary must refuse passive Array subclass');
     fail(result);
    } else pass(result);
   }
  });
 }
}
