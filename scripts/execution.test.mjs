import {describe,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {staticExecutionDigest,validateExecutionPlan,evaluateExecution} from '../tdd-orchestrator/lib/execution.mjs';

// All observations are explicit synthetic caller fixtures, never product evidence.
const H='a'.repeat(64),OTHER='b'.repeat(64);
const proof={path:'evidence/fixture.json',sha256:H};
const canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?`[${v.map(canonical).join(',')}]`:`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const digest=v=>createHash('sha256').update(canonical(v),'utf8').digest('hex');
const clone=v=>structuredClone(v);
function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
const sourceArtifact=()=>({path:proof.path,sha256:H,regular:true,confined:true,source:clone(proof)});
const staticTask=id=>({id,title:`Synthetic ${id}`,allowed_write_globs:['src/**'],acceptance_criteria:['AC-011']});
function fixture(ids=['T001','T002','T003']) {
 const progress={schema_version:'2.3',run_id:'fixture-run',task_source:'synthetic-contract',updated_at:'2026-11-08T00:00:00Z',repo:{head_current:'fixture-revision'},contract:{file:'./specs/specs004-fixture/contracts/interface-contract.md',version:'0.3.0',status:'APPROVED'},acceptance_criteria:[{id:'AC-011',desc:'Synthetic execution criterion',source:'./specs/specs004-fixture/spec.md#AC-011',tasks:[...ids],type:'behavioral',status:'PENDING'}],waves:[{wave:1,status:'in_progress',tasks:ids.map(staticTask)}]};
 const plan={schemaVersion:1,runId:progress.run_id,wave:1,revision:progress.repo.head_current,staticDigest:H,resources:[],tasks:ids.map(id=>({id,owner:'fixture-owner',dependencies:[],resources:[],artifacts:[],isolated:false}))};
 const context={schemaVersion:1,observationId:'fixture-observation',runId:plan.runId,wave:1,revision:plan.revision,expectedStaticDigest:H,environmentDigest:H,source:clone(proof),filesystem:{platform:'win32',caseSensitive:false,allowedRoots:['C:/fixture'],resources:[]},capacity:{maxWorkers:4,activeWorkers:0,writerSlots:4,activeWriterTaskIds:[]},isolation:{available:false,observations:[]},jobs:[],history:[],predecessors:[],artifacts:[sourceArtifact()],integratedReview:{status:'PENDING',runId:plan.runId,revision:plan.revision,staticDigest:H,environmentDigest:H,author:null,reviewer:null,independent:false,source:null}};
 const f={progress,plan,context};rebind(f);return f;
}
// Fixture construction is independent of the export under test. This is the
// published canonical static projection, never a substitute API implementation.
const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
function fixtureDigest({progress:p,plan:q}) {
 const selected=p.waves.find(w=>w.wave===q.wave);
 return digest({schemaVersion:1,progress:{schema_version:p.schema_version,run_id:p.run_id,task_source:p.task_source,contract:{file:p.contract.file,version:p.contract.version},criteria:p.acceptance_criteria.map(({id,desc,source,tasks,type})=>({id,desc,source,tasks:[...tasks].sort(),type:type??'behavioral'})).sort(byId),wave:{wave:selected.wave,tasks:selected.tasks.map(t=>({id:t.id,title:t.title,allowed_write_globs:[...t.allowed_write_globs].sort(),acceptance_criteria:[...t.acceptance_criteria].sort()})).sort(byId)}},plan:{schemaVersion:q.schemaVersion,runId:q.runId,wave:q.wave,revision:q.revision,resources:clone(q.resources).sort(byId),tasks:q.tasks.map(t=>({...clone(t),dependencies:[...t.dependencies].sort(),resources:clone(t.resources).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:a.access<b.access?-1:a.access>b.access?1:0),artifacts:[...t.artifacts].sort()})).sort(byId)}});
}
function rebind(f){const h=fixtureDigest(f);f.plan.staticDigest=h;f.context.expectedStaticDigest=h;f.context.integratedReview.staticDigest=h;return f;}
function resource(f,taskId,id,path,{access='write',kind='file',realPath=path,parentRealPath='C:/fixture',exists=true,directory=false,device='fixture-device',inode=id,symlink=false}={}) {
 f.plan.resources.push({id,path,kind});
 f.plan.tasks.find(t=>t.id===taskId).resources.push({id,access});
 f.context.filesystem.resources.push({resourceId:id,taskId,realPath,parentRealPath,exists,directory,symlink,device:exists?device:null,inode:exists?inode:null,linkCount:exists?1:0,source:clone(proof)});return rebind(f);
}
function returnHash(r){const {returnDigest,source,...data}=r;return digest({...data,dependencies:[...data.dependencies].sort((a,b)=>a.taskId<b.taskId?-1:a.taskId>b.taskId?1:0),artifacts:[...data.artifacts].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)});}
function terminal(f,taskId,{status='PASS',dependencies=[],artifacts=[],attempt=1,wave=f.plan.wave,revision=f.plan.revision,staticDigest=f.plan.staticDigest}={}) {
 const owner=f.plan.tasks.find(t=>t.id===taskId)?.owner??'fixture-owner',instanceId=`${taskId}-instance-${attempt}`,jobId=`${taskId}-job-${attempt}`;
 const r={taskId,wave,runId:f.plan.runId,revision,staticDigest,attempt,instanceId,jobId,owner,status,dependencies:clone(dependencies),artifacts:clone(artifacts),returnDigest:H,source:clone(proof)};r.returnDigest=returnHash(r);
 f.context.history.push({runId:r.runId,wave,taskId,attempt,instanceId,jobId,owner,status,failureClass:status==='FAIL'?'solution':status==='CANCELLED'?'cancelled':null,startSequence:attempt*2-1,terminalSequence:status==='RUNNING'?null:attempt*2,revision,staticDigest,returnDigest:status==='RUNNING'?null:r.returnDigest,source:clone(proof)});
 f.context.jobs.push({runId:r.runId,revision,staticDigest,taskId,attempt,instanceId,jobId,owner,state:status==='RUNNING'?'RUNNING':'TERMINAL',terminalStatus:status==='RUNNING'?null:status,source:clone(proof)});return r;
}
function approve(f){Object.assign(f.context.integratedReview,{status:'PASS',author:'fixture-integrator',reviewer:'fixture-reviewer',independent:true,source:clone(proof)});}
const validate=f=>validateExecutionPlan(f.progress,f.plan,f.context);
const evaluate=(f,returns=[])=>evaluateExecution(f.progress,f.plan,returns,f.context);
function valid(r){expect(r.errors).toEqual([]);expect(r.ok).toBe(true);expect(r.value).not.toBeNull();}
function code(r,expected,{global=false,taskId}={}) {
 expect(r.ok).toBe(false);expect(r.errors.some(e=>e.code===expected&&(taskId===undefined||e.taskId===taskId))).toBe(true);
 if(global)expect(r.value).toBeNull();else expect(r.value).not.toBeNull();
}
function blocked(r,id,c){expect(r.value.blocked.find(t=>t.taskId===id)?.codes).toContain(c);}
function partition(r,ids){const v=r.value,all=[...v.ready,...v.running,...v.completed,...v.blocked.map(t=>t.taskId)];expect([...all].sort()).toEqual([...ids].sort());expect(new Set(all).size).toBe(all.length);}

describe('AC-011: pure execution projection, schema and DAG',()=>{
 it('matches the published static projection and excludes mutable status and its own hash',()=>{
  const f=fixture(['T001']);
  // Deliberately literal oracle for this one fixture, independent of module projection.
  const expected=digest({schemaVersion:1,progress:{schema_version:'2.3',run_id:'fixture-run',task_source:'synthetic-contract',contract:{file:'./specs/specs004-fixture/contracts/interface-contract.md',version:'0.3.0'},criteria:[{id:'AC-011',desc:'Synthetic execution criterion',source:'./specs/specs004-fixture/spec.md#AC-011',tasks:['T001'],type:'behavioral'}],wave:{wave:1,tasks:[{id:'T001',title:'Synthetic T001',allowed_write_globs:['src/**'],acceptance_criteria:['AC-011']}]}},plan:{schemaVersion:1,runId:'fixture-run',wave:1,revision:'fixture-revision',resources:[],tasks:[{id:'T001',owner:'fixture-owner',dependencies:[],resources:[],artifacts:[],isolated:false}]}});
  expect(staticExecutionDigest(f.progress,f.plan)).toBe(expected);
  f.progress.updated_at='changed';f.progress.waves[0].status='completed';f.progress.waves[0].tasks[0].phase='DONE';f.progress.acceptance_criteria[0].status='VALIDATED';f.plan.staticDigest=OTHER;
  expect(staticExecutionDigest(f.progress,f.plan)).toBe(expected);
 });
 it('canonicalizes declared sets without mutation and changes hash for contract or task semantics',()=>{
  const f=fixture();resource(f,'T001','R2','C:/fixture/b');resource(f,'T001','R1','C:/fixture/a');f.plan.tasks[2].dependencies=['T002','T001'];rebind(f);
  const before=clone(f),reverse=clone(f);reverse.plan.tasks.reverse();reverse.plan.resources.reverse();reverse.plan.tasks.find(t=>t.id==='T001').resources.reverse();reverse.plan.tasks.find(t=>t.id==='T003').dependencies.reverse();reverse.progress.acceptance_criteria[0].tasks.reverse();reverse.progress.waves[0].tasks.reverse();
  expect(staticExecutionDigest(reverse.progress,reverse.plan)).toBe(f.plan.staticDigest);expect(f).toEqual(before);
  for(const mutate of [x=>{x.progress.contract.version='0.3.1';},x=>{x.progress.acceptance_criteria[0].desc='Changed criterion';},x=>{x.plan.tasks[0].owner='other';},x=>{x.plan.resources[0].path='C:/fixture/changed';},x=>{x.plan.tasks[2].dependencies=['T001'];},x=>{x.plan.revision='new-revision';x.progress.repo.head_current='new-revision';}]){
   const q=clone(f);mutate(q);expect(staticExecutionDigest(q.progress,q.plan)).not.toBe(f.plan.staticDigest);
  }
 });
 it('accepts an exact acyclic wave, empty resources, isolated false and shared owner',()=>{
  const f=fixture();f.plan.tasks[1].dependencies=['T001'];rebind(f);valid(validate(f));
  const r=evaluate(f);valid(r);expect(r.value.ready).toEqual(['T001','T003']);blocked(r,'T002','DEPENDENCY_PENDING');expect(r.value.complete).toBe(false);partition(r,['T001','T002','T003']);
 });
 it.each([
  ['missing task','E_TASK_SET',f=>{f.plan.tasks.pop();}],
  ['extra task','E_TASK_SET',f=>{f.plan.tasks.push({...clone(f.plan.tasks[0]),id:'Other'});}],
  ['duplicate case ID','E_TASK_SET',f=>{f.plan.tasks[1].id='t001';}],
  ['unknown dependency','E_DEPENDENCY',f=>{f.plan.tasks[0].dependencies=['Unknown'];}],
  ['self dependency','E_DEPENDENCY',f=>{f.plan.tasks[0].dependencies=['T001'];}],
  ['cycle','E_CYCLE',f=>{f.plan.tasks[0].dependencies=['T002'];f.plan.tasks[1].dependencies=['T001'];}],
  ['extra key','E_SCHEMA',f=>{f.plan.extra=true;}],
  ['boolean string','E_SCHEMA',f=>{f.plan.tasks[0].isolated='false';}],
  ['missing boolean','E_SCHEMA',f=>{delete f.plan.tasks[0].isolated;}],
  ['fractional wave','E_SCHEMA',f=>{f.plan.wave=1.5;}],
  ['wrong schema','E_PROGRESS',f=>{f.progress.schema_version='2.2';}],
  ['run mismatch','E_BINDING',f=>{f.context.runId='other';}],
  ['revision mismatch','E_BINDING',f=>{f.context.revision='other';}],
  ['static hash mismatch','E_BINDING',f=>{f.context.expectedStaticDigest=OTHER;}],
 ])('rejects %s globally with %s',(_label,expected,mutate)=>{
  const f=fixture();mutate(f);if(['E_TASK_SET','E_DEPENDENCY','E_CYCLE'].includes(expected))rebind(f);
  const before=clone(f);code(validate(f),expected,{global:true});expect(f).toEqual(before);code(evaluate(f),expected,{global:true});
 });
 it('rejects future-wave dependency and throws the declared error for invalid static metadata',()=>{
  const f=fixture();f.progress.waves.push({wave:2,status:'pending',tasks:[staticTask('Future')]});f.plan.tasks[0].dependencies=['Future'];
  rebind(f);code(validate(f),'E_DEPENDENCY',{global:true});
  const q=fixture();q.progress.run_id='';expect(()=>staticExecutionDigest(q.progress,q.plan)).toThrow(expect.objectContaining({name:'ExecutionError',code:'E_PROGRESS'}));
 });
 it('is pure with deeply frozen inputs and returns fresh deterministic views',()=>{
  const f=fixture(),before=clone(f);freeze(f);const a=validate(f),b=validate(f);valid(a);expect(a).toEqual(b);expect(a.value).not.toBe(b.value);valid(evaluate(f,freeze([])));expect(f).toEqual(before);
 });
 it.each([
  ['context extra',f=>{f.context.extra=true;}],
  ['resource capture boolean string',f=>{resource(f,'T001','R','C:/fixture/a');f.context.filesystem.resources[0].exists='true';}],
  ['capacity NaN',f=>{f.context.capacity.maxWorkers=NaN;}],
  ['sparse tasks array',f=>{delete f.plan.tasks[1];}],
  ['source extra',f=>{f.context.source.extra=true;}],
 ])('rejects closed-schema violations without throwing: %s',(_label,mutate)=>{
  const f=fixture();mutate(f);let r;expect(()=>{r=validate(f);}).not.toThrow();code(r,'E_SCHEMA',{global:true});
 });
});

describe('AC-011: observed resource identity, aliases and capacity',()=>{
 it.each([
  ['case alias',{realPath:'C:/fixture/shared',inode:'first'},{realPath:'C:/fixture/SHARED',inode:'second'}],
  ['hardlink identity',{realPath:'C:/fixture/a',inode:'same'},{realPath:'C:/fixture/b',inode:'same'}],
  ['symlink alias',{realPath:'C:/fixture/shared',inode:'same'},{realPath:'C:/fixture/shared',inode:'same',symlink:true}],
 ])('reports %s as a serializable conflict, not structural failure',(_label,left,right)=>{
  const f=fixture(['T001','T002']);resource(f,'T001','A','C:/fixture/a',left);resource(f,'T002','B','C:/fixture/b',right);
  const r=validate(f);valid(r);expect(r.value.conflicts).toEqual([{left:'T001',right:'T002',resourceIds:['A','B']}]);const e=evaluate(f);valid(e);expect(e.value.ready).toEqual(['T001','T002']);expect(e.value.conflicts).toEqual(r.value.conflicts);
 });
 it.each(['directory','cache','output','state'])('locks parent/child for observed directory kind %s including a not-yet-created child',kind=>{
  const f=fixture(['T001','T002']);resource(f,'T001','Parent','C:/fixture/cache',{kind,directory:true});resource(f,'T002','Child','C:/fixture/cache/new',{exists:false,parentRealPath:'C:/fixture/cache'});
  valid(validate(f));expect(validate(f).value.conflicts).toHaveLength(1);
 });
 it('permits read/read aliases and case-distinct files on a case-sensitive filesystem',()=>{
  const f=fixture(['T001','T002']);resource(f,'T001','A','C:/fixture/a',{access:'read',realPath:'C:/fixture/same'});resource(f,'T002','B','C:/fixture/b',{access:'read',realPath:'C:/fixture/same'});expect(validate(f).value.conflicts).toEqual([]);
  f.context.filesystem.caseSensitive=true;f.context.filesystem.resources[1].realPath='C:/fixture/SAME';f.plan.tasks[0].resources[0].access='write';rebind(f);valid(validate(f));expect(validate(f).value.conflicts).toEqual([]);
 });
 it('respects POSIX path boundaries and does not mistake a sibling prefix for a child lock',()=>{
  const f=fixture(['T001','T002']);f.context.filesystem.platform='posix';f.context.filesystem.caseSensitive=true;f.context.filesystem.allowedRoots=['/fixture'];
  resource(f,'T001','Parent','/fixture/cache',{kind:'directory',directory:true,parentRealPath:'/fixture'});
  resource(f,'T002','Sibling','/fixture/cache-other/a',{parentRealPath:'/fixture/cache-other'});
  valid(validate(f));expect(validate(f).value.conflicts).toEqual([]);
 });
 it.each([
  ['outside allowed root',f=>{f.plan.resources[0].path='C:/outside/a';}],
  ['traversal path',f=>{f.plan.resources[0].path='C:/fixture/../a';}],
  ['missing observation',f=>{f.context.filesystem.resources=[];}],
  ['missing inode',f=>{f.context.filesystem.resources[0].inode=null;}],
  ['unconfined canonical identity',f=>{f.context.filesystem.resources[0].realPath='C:/outside/a';}],
  ['duplicate observation',f=>{f.context.filesystem.resources.push(clone(f.context.filesystem.resources[0]));}],
  ['hidden resource',f=>{f.plan.resources.push({id:'Unused',path:'C:/fixture/unused',kind:'file'});}],
 ])('rejects unsafe resource capture: %s',(_label,mutate)=>{const f=fixture();resource(f,'T001','A','C:/fixture/a');mutate(f);rebind(f);code(validate(f),'E_RESOURCE',{global:true});});
 it('unproven isolation blocks only its task and does not remove shared cache conflicts',()=>{
  const f=fixture();resource(f,'T001','A','C:/fixture/cache',{kind:'cache',directory:true});resource(f,'T002','B','C:/fixture/cache',{kind:'cache',directory:true});f.plan.tasks[0].isolated=true;rebind(f);
  code(validate(f),'E_ISOLATION',{taskId:'T001'});const r=evaluate(f);code(r,'E_ISOLATION',{taskId:'T001'});blocked(r,'T001','ISOLATION_UNPROVEN');expect(r.value.ready).toContain('T003');
  f.context.isolation={available:true,observations:[{taskId:'T001',instanceId:'T001-instance-1',worktreeRoot:'C:/fixture/worktree',resourceIds:['A'],verified:true,source:clone(proof)}]};
  valid(validate(f));expect(validate(f).value.conflicts).toHaveLength(1);
 });
 it('uses actual free worker/writer capacity without choosing a batch or blocking a reader',()=>{
  const f=fixture();resource(f,'T001','A','C:/fixture/a');resource(f,'T002','B','C:/fixture/b');f.context.capacity.writerSlots=1;
  let r=evaluate(f);valid(r);expect(r.value.ready).toEqual(['T001','T002','T003']);
  f.context.capacity.writerSlots=0;r=evaluate(f);valid(r);blocked(r,'T001','CAPACITY');blocked(r,'T002','CAPACITY');expect(r.value.ready).toEqual(['T003']);
  f.context.capacity.activeWorkers=4;r=evaluate(f);valid(r);expect(r.value.ready).toEqual([]);blocked(r,'T003','CAPACITY');
 });
 it.each([['zero workers',c=>{c.maxWorkers=0;}],['active exceeds maximum',c=>{c.activeWorkers=5;}],['negative writer slots',c=>{c.writerSlots=-1;}]])('rejects structurally invalid capacity: %s',(_label,mutate)=>{const f=fixture();mutate(f.context.capacity);code(validate(f),'E_CAPACITY',{global:true});});
 it('requires active writer ownership and retains its resource lock when a local job is invalid',()=>{
  const f=fixture();resource(f,'T001','A','C:/fixture/shared');resource(f,'T002','B','C:/fixture/shared');terminal(f,'T001',{status:'RUNNING'});f.context.capacity.activeWorkers=1;f.context.capacity.activeWriterTaskIds=['T001'];
  let r=evaluate(f);valid(r);expect(r.value.running).toEqual(['T001']);blocked(r,'T002','RESOURCE_BUSY');expect(r.value.ready).toEqual(['T003']);
  f.context.jobs[0].owner='wrong-owner';r=evaluate(f);code(r,'E_JOB',{taskId:'T001'});blocked(r,'T002','RESOURCE_BUSY');expect(r.value.ready).toContain('T003');
 });
});

describe('AC-011: exact current returns, history and partial visibility',()=>{
 it('completes exact current PASS returns only after an independent integrated review',()=>{
  const f=fixture();f.plan.tasks[1].dependencies=['T001'];rebind(f);const a=terminal(f,'T001'),b=terminal(f,'T002',{dependencies:[{taskId:'T001',returnDigest:a.returnDigest}]}),c=terminal(f,'T003');
  let r=evaluate(f,[c,b,a]);code(r,'E_REVIEW_STALE');expect(r.value.completed).toEqual(['T001','T002','T003']);expect(r.value.complete).toBe(false);
  approve(f);const returns=[c,b,a],before=clone({f,returns});freeze(f);freeze(returns);r=evaluate(f,returns);valid(r);expect(r.value.complete).toBe(true);expect(r.value.ready).toEqual([]);partition(r,['T001','T002','T003']);expect({f,returns}).toEqual(before);
 });
 it('does not demand final review early and continues independent work after failure',()=>{
  const f=fixture();f.plan.tasks[1].dependencies=['T001'];rebind(f);const failed=terminal(f,'T001',{status:'FAIL'}),r=evaluate(f,[failed]);
  code(r,'E_TASK_FAILED',{taskId:'T001'});blocked(r,'T002','DEPENDENCY_FAILED');expect(r.value.ready).toEqual(['T003']);expect(r.errors.some(e=>e.code==='E_REVIEW_STALE')).toBe(false);expect(r.value.complete).toBe(false);partition(r,['T001','T002','T003']);
 });
 it.each([
  ['duplicate','E_RETURN_SET',(f,r)=>[r,r]],
  ['unknown','E_RETURN_SET',(f,r)=>[{...r,taskId:'Unknown'}]],
  ['stale revision','E_RETURN_STALE',(f,r)=>[{...r,revision:'old-revision'}]],
  ['stale static digest','E_RETURN_STALE',(f,r)=>[{...r,staticDigest:OTHER}]],
  ['forged return digest','E_RETURN_STALE',(f,r)=>[{...r,returnDigest:OTHER}]],
  ['wrong owner','E_JOB',(f,r)=>[{...r,owner:'other'}]],
  ['wrong job','E_JOB',(f,r)=>[{...r,jobId:'other-job'}]],
 ])('rejects %s current return with %s and leaves independent tasks visible',(_label,expected,make)=>{
  const f=fixture(),r=terminal(f,'T001'),result=evaluate(f,make(f,r));code(result,expected);expect(result.value.ready).toContain('T003');expect(result.value.complete).toBe(false);
 });
 it('distinguishes not-started, observed RUNNING, terminal-missing and UNKNOWN jobs',()=>{
  const f=fixture();let r=evaluate(f);valid(r);expect(r.value.ready).toContain('T001');terminal(f,'T001',{status:'RUNNING'});r=evaluate(f);valid(r);expect(r.value.running).toEqual(['T001']);expect(r.value.complete).toBe(false);
  f.context.jobs[0].state='UNKNOWN';r=evaluate(f);code(r,'E_JOB',{taskId:'T001'});expect(r.value.running).not.toContain('T001');
  const q=fixture();terminal(q,'T001');r=evaluate(q);code(r,'E_RETURN_MISSING',{taskId:'T001'});expect(r.value.ready).toContain('T003');
 });
 it('requires exact dependency digests and invalidates a dependent after predecessor changes',()=>{
  const f=fixture();f.plan.tasks[1].dependencies=['T001'];rebind(f);const a=terminal(f,'T001'),b=terminal(f,'T002',{dependencies:[{taskId:'T001',returnDigest:OTHER}]});
  let r=evaluate(f,[a,b]);code(r,'E_PREDECESSOR',{taskId:'T002'});expect(r.value.completed).toEqual(['T001']);expect(r.value.ready).toEqual(['T003']);
  for(const dependencies of [[],[{taskId:'T001',returnDigest:a.returnDigest},{taskId:'T003',returnDigest:H}]]){const q=clone(b);q.dependencies=dependencies;q.returnDigest=returnHash(q);f.context.history.find(h=>h.taskId==='T002').returnDigest=q.returnDigest;code(evaluate(f,[a,q]),'E_PREDECESSOR',{taskId:'T002'});}
 });
 it('checks artifacts against exact planned paths and current confined regular observations',()=>{
  const f=fixture();f.plan.tasks[0].artifacts=['outputs/a.json'];rebind(f);f.context.artifacts.push({path:'outputs/a.json',sha256:OTHER,regular:true,confined:true,source:clone(proof)});const a=terminal(f,'T001',{artifacts:[{path:'outputs/a.json',sha256:OTHER}]});valid(evaluate(f,[a]));
  for(const mutate of [x=>{x.context.artifacts[1].sha256=H;},x=>{x.context.artifacts[1].regular=false;},x=>{x.context.artifacts[1].confined=false;},x=>{x.context.artifacts.pop();},x=>{x.context.artifacts[0].sha256=OTHER;}]){const q=clone(f);mutate(q);code(evaluate(q,[a]),'E_ARTIFACT',{taskId:'T001'});}
  const missing=clone(a);missing.artifacts=[];missing.returnDigest=returnHash(missing);f.context.history[0].returnDigest=missing.returnDigest;code(evaluate(f,[missing]),'E_ARTIFACT',{taskId:'T001'});
 });
 it.each([
  ['non-contiguous attempt',h=>{h[0].attempt=2;}],
  ['fourth attempt',h=>{h[0].attempt=4;}],
  ['overlap',h=>{h[1].startSequence=h[0].terminalSequence;}],
  ['reused instance',h=>{h[1].instanceId=h[0].instanceId;}],
  ['reused job',h=>{h[1].jobId=h[0].jobId;}],
 ])('preserves attempt identity/history and rejects %s',(_label,mutate)=>{
  const f=fixture();terminal(f,'T001',{status:'FAIL'});f.context.jobs=[];const second=terminal(f,'T001',{attempt:2});mutate(f.context.history);const r=evaluate(f,[second]);code(r,'E_HISTORY',{taskId:'T001'});expect(r.value.ready).toContain('T003');
 });
 it('retains cap three after failed retries and never promotes historical success to the current revision',()=>{
  const f=fixture();for(let attempt=1;attempt<=3;attempt++){f.context.jobs=[];terminal(f,'T001',{status:'FAIL',attempt});}const r=evaluate(f);expect(r.value.complete).toBe(false);blocked(r,'T001','ATTEMPTS_EXHAUSTED');expect(r.value.ready).toContain('T003');expect(f.context.history).toHaveLength(3);
  const q=fixture(),old=terminal(q,'T001',{revision:'old-revision',staticDigest:OTHER});code(evaluate(q,[old]),'E_RETURN_STALE',{taskId:'T001'});
 });
 it.each([
  ['same author/reviewer',r=>{r.reviewer=r.author;}],['not independent',r=>{r.independent=false;}],['stale revision',r=>{r.revision='old';}],['wrong environment',r=>{r.environmentDigest=OTHER;}],['wrong static digest',r=>{r.staticDigest=OTHER;}],['missing proof',r=>{r.source=null;}],
 ])('rejects integrated review %s only at the complete candidate',(_label,mutate)=>{const f=fixture(['T001']),a=terminal(f,'T001');approve(f);mutate(f.context.integratedReview);const r=evaluate(f,[a]);code(r,'E_REVIEW_STALE');expect(r.value.complete).toBe(false);});
 it('validates prior-wave bindings separately and preserves independent ready tasks on predecessor staleness',()=>{
  const f=fixture(['T002','T003']);f.progress.waves.unshift({wave:1,status:'completed',tasks:[staticTask('T001')]});f.progress.waves[1].wave=2;f.progress.acceptance_criteria[0].tasks.push('T001');f.plan.wave=2;f.context.wave=2;f.plan.tasks[0].dependencies=['T001'];rebind(f);
  const previous=terminal(f,'T001',{wave:1,staticDigest:OTHER});f.context.predecessors=[{taskId:'T001',expectedRevision:f.plan.revision,expectedStaticDigest:OTHER,expectedReturnDigest:previous.returnDigest,source:clone(proof),result:previous}];
  let r=evaluate(f);valid(r);expect(r.value.ready).toEqual(['T002','T003']);
  f.context.predecessors[0].expectedReturnDigest=H;r=evaluate(f);code(r,'E_PREDECESSOR',{taskId:'T002'});expect(r.value.ready).toEqual(['T003']);expect(r.value.complete).toBe(false);
 });
 it('returns closed deterministic diagnostic envelopes without echoing rejected values',()=>{
  const f=fixture();f.plan.tasks[0].isolated='SECRET-REJECTED-FIXTURE';const a=validate(f),b=validate(f);expect(a).toEqual(b);expect(Object.keys(a).sort()).toEqual(['errors','ok','value']);expect(JSON.stringify(a)).not.toContain('SECRET-REJECTED-FIXTURE');
  for(const e of a.errors){expect(Object.keys(e).sort()).toEqual(['code','message','path','taskId']);expect(e.path===''||e.path.startsWith('/')).toBe(true);}
 });
});

// Review-closure regressions: expected outcomes follow frozen execution0.3r2
// AC-011, using caller observations only. Baseline tests above remain verbatim.
describe('AC-011: review closure T003-IR-001 running resource occupancy',()=>{
 function occupiedReader({newAccess='write',sameResource=true}={}) {
  const f=fixture();resource(f,'T001','Reader','C:/fixture/shared',{access:'read'});
  resource(f,'T002','Candidate',sameResource?'C:/fixture/shared':'C:/fixture/other',{access:newAccess});
  terminal(f,'T001',{status:'RUNNING'});f.context.capacity.activeWorkers=1;return f;
 }
 it('IR001 blocks only a conflicting new writer while an observed reader is RUNNING',()=>{
  const f=occupiedReader(),r=evaluate(f);valid(r);
  expect(r.value.running).toEqual(['T001']);expect(r.value.blocked).toContainEqual(expect.objectContaining({taskId:'T002',codes:expect.arrayContaining(['RESOURCE_BUSY'])}));
  expect(r.value.ready).toEqual(['T003']);expect(r.value.conflicts).toEqual([{left:'T001',right:'T002',resourceIds:['Candidate','Reader']}]);partition(r,['T001','T002','T003']);
 });
 it('IR001 retains reader occupancy even when its current job has a local owner error',()=>{
  const f=occupiedReader();f.context.jobs[0].owner='wrong-owner';const r=evaluate(f);
  code(r,'E_JOB',{taskId:'T001'});expect(r.value.blocked).toContainEqual(expect.objectContaining({taskId:'T002',codes:expect.arrayContaining(['RESOURCE_BUSY'])}));expect(r.value.ready).toEqual(['T003']);partition(r,['T001','T002','T003']);
 });
 it('IR001 permits a second reader of the occupied identity',()=>{
  const f=occupiedReader({newAccess:'read'}),r=evaluate(f);valid(r);
  expect(r.value.running).toEqual(['T001']);expect(r.value.ready).toEqual(['T002','T003']);expect(r.value.conflicts).toEqual([]);
 });
 it('IR001 permits an independent writer while the reader keeps its own resource',()=>{
  const f=occupiedReader({sameResource:false}),r=evaluate(f);valid(r);
  expect(r.value.running).toEqual(['T001']);expect(r.value.ready).toEqual(['T002','T003']);expect(r.value.conflicts).toEqual([]);
 });
 it('IR001 releases reader occupancy after a current terminal PASS return',()=>{
  const f=fixture();resource(f,'T001','Reader','C:/fixture/shared',{access:'read'});resource(f,'T002','Candidate','C:/fixture/shared');
  const r=evaluate(f,[terminal(f,'T001')]);valid(r);expect(r.value.completed).toEqual(['T001']);expect(r.value.ready).toEqual(['T002','T003']);
 });
 it('IR001 leaves both idle conflicting tasks individually ready for dispatcher serialization',()=>{
  const f=fixture();resource(f,'T001','Reader','C:/fixture/shared',{access:'read'});resource(f,'T002','Candidate','C:/fixture/shared');
  const r=evaluate(f);valid(r);expect(r.value.ready).toEqual(['T001','T002','T003']);expect(r.value.conflicts).toHaveLength(1);
 });
});

describe('AC-011: review closure T003-IR-002 resource source observations',()=>{
 function resourceProofFixture(){
  const f=fixture();resource(f,'T001','A','C:/fixture/a');
  f.context.filesystem.resources[0].source={path:'evidence/resource-capture.json',sha256:OTHER};
  f.context.artifacts.push({path:'evidence/resource-capture.json',sha256:OTHER,regular:true,confined:true,source:clone(proof)});return f;
 }
 it.each([
  ['missing path',f=>{f.context.artifacts.pop();}],
  ['different hash',f=>{f.context.artifacts[1].sha256=H;}],
  ['nonregular observation',f=>{f.context.artifacts[1].regular=false;}],
  ['unconfined observation',f=>{f.context.artifacts[1].confined=false;}],
 ])('IR002 rejects resource source with %s before using the capture',(_label,mutate)=>{
  const f=resourceProofFixture();valid(validate(f));mutate(f);const before=clone(f);
  for(const r of [validate(f),evaluate(f)]){
   expect(r.ok).toBe(false);expect(r.errors.some(e=>['E_RESOURCE','E_ARTIFACT'].includes(e.code))).toBe(true);expect(r.value).toBeNull();
  }
  expect(f).toEqual(before);
 });
 it('IR002 accepts the same resource capture with an exact current regular confined source observation',()=>{
  const f=resourceProofFixture();valid(validate(f));const r=evaluate(f);valid(r);expect(r.value.ready).toEqual(['T001','T002','T003']);
 });
});

describe('AC-011: review closure T003-IR-003 canonical Windows segments',()=>{
 it.each([
  ['plan path trailing dot',f=>{f.plan.resources[0].path='C:/fixture/cache./new';}],
  ['plan path trailing space',f=>{f.plan.resources[0].path='C:/fixture/cache /new';}],
  ['observed paths trailing dot',f=>{Object.assign(f.context.filesystem.resources[0],{realPath:'C:/fixture/cache./inner/new',parentRealPath:'C:/fixture/cache./inner'});}],
  ['observed paths trailing space',f=>{Object.assign(f.context.filesystem.resources[0],{realPath:'C:/fixture/cache /inner/new',parentRealPath:'C:/fixture/cache /inner'});}],
  ['allowed root trailing dot',f=>{f.context.filesystem.allowedRoots.push('C:/fixture/cache./inner');}],
  ['allowed root trailing space',f=>{f.context.filesystem.allowedRoots.push('C:/fixture/cache /inner');}],
 ])('IR003 rejects ambiguous %s instead of trusting lexical confinement',(_label,mutate)=>{
  const f=fixture();resource(f,'T001','A','C:/fixture/cache/new',{parentRealPath:'C:/fixture/cache'});valid(validate(f));mutate(f);rebind(f);
  code(validate(f),'E_RESOURCE',{global:true});code(evaluate(f),'E_RESOURCE',{global:true});
 });
 it.each(['.',' '])('IR003 rejects a directory alias ending in %j against a not-yet-created child',suffix=>{
  const f=fixture();resource(f,'T001','Parent',`C:/fixture/cache${suffix}/data`,{kind:'cache',directory:true});
  resource(f,'T002','Child','C:/fixture/cache/data/new',{exists:false,parentRealPath:'C:/fixture/cache/data'});
  code(validate(f),'E_RESOURCE',{global:true});code(evaluate(f),'E_RESOURCE',{global:true});
 });
 it('IR003 accepts canonical Windows dots and spaces within segments and preserves child conflicts',()=>{
  const f=fixture();resource(f,'T001','Parent','C:/fixture/cache.v2 data',{kind:'directory',directory:true});
  resource(f,'T002','Child','C:/fixture/cache.v2 data/new.json',{exists:false,parentRealPath:'C:/fixture/cache.v2 data'});
  valid(validate(f));const r=evaluate(f);valid(r);expect(r.value.conflicts).toHaveLength(1);expect(r.value.ready).toEqual(['T001','T002','T003']);
 });
 it.each(['.',' '])('IR003 preserves legal POSIX segment ending in %j as a distinct identity',suffix=>{
  const f=fixture(['T001','T002']);f.context.filesystem.platform='posix';f.context.filesystem.caseSensitive=true;f.context.filesystem.allowedRoots=['/fixture'];
  resource(f,'T001','Parent',`/fixture/cache${suffix}/data`,{kind:'directory',directory:true,parentRealPath:'/fixture'});
  resource(f,'T002','Child','/fixture/cache/data/new',{exists:false,parentRealPath:'/fixture/cache/data'});
  valid(validate(f));const r=evaluate(f);valid(r);expect(r.value.conflicts).toEqual([]);expect(r.value.ready).toEqual(['T001','T002']);
 });
});

describe('AC-011: review closure T003-IR-004 latest attempt isolation',()=>{
 function retriedIsolation({status='RUNNING',proofAttempt=2}={}) {
  const f=fixture();resource(f,'T001','A','C:/fixture/a');f.plan.tasks[0].isolated=true;rebind(f);
  terminal(f,'T001',{status:'FAIL'});f.context.jobs=[];const latest=terminal(f,'T001',{status,attempt:2});
  f.context.capacity.activeWorkers=status==='RUNNING'?1:0;
  if(status==='RUNNING')f.context.capacity.activeWriterTaskIds=['T001'];
  f.context.isolation={available:true,observations:[{taskId:'T001',instanceId:`T001-instance-${proofAttempt}`,worktreeRoot:'C:/fixture/worktree',resourceIds:['A'],verified:true,source:clone(proof)}]};
  return {f,returns:status==='RUNNING'?[]:[latest]};
 }
 it('IR004 accepts current second-attempt isolation in chronological history order',()=>{
  const {f,returns}=retriedIsolation();valid(validate(f));const r=evaluate(f,returns);valid(r);expect(r.value.running).toEqual(['T001']);expect(r.value.ready).toEqual(['T002','T003']);
 });
 it('IR004 selects the greatest attempt for isolation regardless of physical history order',()=>{
  const {f,returns}=retriedIsolation();const ordered=evaluate(f,returns);valid(ordered);f.context.history.reverse();const before=clone(f);
  valid(validate(f));const r=evaluate(f,returns);valid(r);expect(r).toEqual(ordered);expect(r.value.running).toEqual(['T001']);expect(f).toEqual(before);
 });
 it('IR004 rejects old-instance isolation even when an older attempt is last in the history array',()=>{
  const {f,returns}=retriedIsolation({proofAttempt:1});f.context.history.reverse();
  code(validate(f),'E_ISOLATION',{taskId:'T001'});const r=evaluate(f,returns);code(r,'E_ISOLATION',{taskId:'T001'});blocked(r,'T001','ISOLATION_UNPROVEN');expect(r.value.ready).toEqual(['T002','T003']);
 });
 it('IR004 rejects old-instance isolation in chronological history order too',()=>{
  const {f,returns}=retriedIsolation({proofAttempt:1});code(validate(f),'E_ISOLATION',{taskId:'T001'});const r=evaluate(f,returns);code(r,'E_ISOLATION',{taskId:'T001'});blocked(r,'T001','ISOLATION_UNPROVEN');
 });
 it('IR004 preserves current PASS return completion with reordered failed and successful attempts',()=>{
  const {f,returns}=retriedIsolation({status:'PASS'});const ordered=evaluate(f,returns);valid(ordered);expect(ordered.value.completed).toEqual(['T001']);
  f.context.history.reverse();valid(validate(f));const r=evaluate(f,returns);valid(r);expect(r).toEqual(ordered);expect(r.value.ready).toEqual(['T002','T003']);
 });
});
describe('AC-002: safe execution locks and filesystem roots',()=>{
 function conflictingWriterAttempt(){
  const f=fixture(['T001','T002']);
  resource(f,'T001','WriterA','C:/fixture/shared');
  resource(f,'T002','WriterB','C:/fixture/shared');
  terminal(f,'T001',{status:'RUNNING'});
  f.context.capacity.activeWorkers=1;
  return f;
 }
 function invalidTerminalAfterRunningAttempt(){
  const f=fixture();
  resource(f,'T001','WriterA','C:/fixture/shared');
  resource(f,'T002','WriterB','C:/fixture/shared');
  resource(f,'T003','WriterC','C:/fixture/independent');
  terminal(f,'T001',{status:'RUNNING'});
  terminal(f,'T001',{status:'PASS',attempt:2});
  return f;
 }
 it.each([
  ['revision',{revision:'old-revision'}],
  ['static digest',{staticDigest:OTHER}],
 ])('Review01-01 rejects stale RUNNING %s while retaining the conflicting lock',(_label,stale)=>{
  const f=fixture();resource(f,'T001','WriterA','C:/fixture/shared');resource(f,'T002','WriterB','C:/fixture/shared');resource(f,'T003','WriterC','C:/fixture/independent');
  terminal(f,'T001',{status:'RUNNING',...stale});
  const r=evaluate(f);code(r,'E_HISTORY',{taskId:'T001'});blocked(r,'T002','RESOURCE_BUSY');
  expect(r.value.ready).toContain('T003');expect(r.value.running).not.toContain('T001');expect(r.value.complete).toBe(false);
 });
 function conflictingReaderAttempt(){
  const f=fixture(['T001','T002']);
  resource(f,'T001','Reader','C:/fixture/shared',{access:'read'});
  resource(f,'T002','Writer','C:/fixture/shared',{access:'write'});
  terminal(f,'T001',{status:'RUNNING'});
  f.context.capacity.activeWorkers=1;
  return f;
 }
 function conflictingGlobalResourceObservation(){
  const f=fixture(['T001','T002']);
  const id='Shared';
  f.plan.resources.push({id,path:'C:/fixture/shared',kind:'file'});
  f.plan.tasks[0].resources.push({id,access:'write'});
  f.plan.tasks[1].resources.push({id,access:'write'});
  f.context.filesystem.resources.push(
   {resourceId:id,taskId:'T001',realPath:'C:/fixture/shared',parentRealPath:'C:/fixture',exists:true,directory:false,symlink:false,device:'fixture-device-a',inode:'inode-a',linkCount:1,source:clone(proof)},
   {resourceId:id,taskId:'T002',realPath:'C:/fixture/other',parentRealPath:'C:/fixture',exists:true,directory:false,symlink:false,device:'fixture-device-b',inode:'inode-b',linkCount:1,source:clone(proof)},
  );
  rebind(f);
  return f;
 }
 function rootResource({platform,caseSensitive,allowedRoot,path,parentRealPath}){
  const f=fixture(['T001']);
  Object.assign(f.context.filesystem,{platform,caseSensitive,allowedRoots:[allowedRoot]});
  resource(f,'T001','Rooted',path,{parentRealPath});
  return f;
 }
 function expectUnsafeRoot(f){
  code(validate(f),'E_RESOURCE',{global:true});
  code(evaluate(f),'E_RESOURCE',{global:true});
 }

 it('keeps a conflicting writer blocked when history is RUNNING and its job is absent',()=>{
  const f=conflictingWriterAttempt();
  f.context.jobs=[];
  const r=evaluate(f);
  code(r,'E_JOB',{taskId:'T001'});
  expect(r.value.ready).toEqual([]);
  expect(r.value.running).toEqual([]);
  expect(r.value.completed).toEqual([]);
  blocked(r,'T001','E_JOB');
  blocked(r,'T002','RESOURCE_BUSY');
  expect(r.value.complete).toBe(false);
  partition(r,['T001','T002']);
 });

 it('keeps a conflicting writer blocked when history is RUNNING and its job is UNKNOWN',()=>{
  const f=conflictingWriterAttempt();
  f.context.jobs[0].state='UNKNOWN';
  const r=evaluate(f);
  code(r,'E_JOB',{taskId:'T001'});
  expect(r.value.ready).toEqual([]);
  expect(r.value.running).toEqual([]);
  expect(r.value.completed).toEqual([]);
  blocked(r,'T001','E_JOB');
  blocked(r,'T002','RESOURCE_BUSY');
  expect(r.value.complete).toBe(false);
  partition(r,['T001','T002']);
 });
 it.each([
  ['no current job',f=>{f.context.jobs=[];}],
  ['terminal job only',f=>{f.context.jobs=f.context.jobs.filter(j=>j.state==='TERMINAL');}],
 ])('retains an earlier RUNNING writer lock after an invalid later terminal history with %s',(_label,removeCurrentJob)=>{
  const f=invalidTerminalAfterRunningAttempt();
  removeCurrentJob(f);
  const before=clone(f);freeze(f);
  const r=evaluate(f);
  code(r,'E_HISTORY',{taskId:'T001'});
  expect(r.value.complete).toBe(false);
  expect(r.value.ready).toContain('T003');
  expect(r.value.ready).not.toContain('T002');
  blocked(r,'T002','RESOURCE_BUSY');
  partition(r,['T001','T002','T003']);
  expect(f).toEqual(before);
 });
 it.each([
  ['missing job',f=>{f.context.jobs=[];}],
  ['UNKNOWN job',f=>{f.context.jobs[0].state='UNKNOWN';}],
 ])('retains a RUNNING reader lock when its job is %s',(_label,mutate)=>{
  const f=conflictingReaderAttempt();
  mutate(f);
  const r=evaluate(f);
  code(r,'E_JOB',{taskId:'T001'});
  expect(r.value.ready).not.toContain('T002');
  expect(r.value.running).not.toContain('T002');
  expect(r.value.blocked).toContainEqual(expect.objectContaining({taskId:'T002',codes:expect.arrayContaining(['RESOURCE_BUSY'])}));
  expect(r.value.complete).toBe(false);
  partition(r,['T001','T002']);
 });
it('keeps a conflicting writer blocked when a terminal task job is UNKNOWN while an independent writer remains ready',()=>{
 const f=fixture();
 resource(f,'T001','WriterA','C:/fixture/shared');
 resource(f,'T002','WriterB','C:/fixture/shared');
 resource(f,'T003','WriterC','C:/fixture/independent');
 terminal(f,'T001',{status:'PASS'});
 f.context.jobs[0].state='UNKNOWN';
 valid(validate(f));
 const r=evaluate(f);
 code(r,'E_JOB',{taskId:'T001'});
 blocked(r,'T001','E_JOB');
 expect(r.errors.some(e=>e.code==='E_SCHEMA')).toBe(false);
 expect(r.value.ready).toEqual(['T003']);
 blocked(r,'T002','RESOURCE_BUSY');
 expect(r.value.complete).toBe(false);
 partition(r,['T001','T002','T003']);
});
 it.each(['auth','configuration'])('does not retry or escalate after an ineligible terminal %s failure when current observations are cleared',failureClass=>{
  const f=fixture(['T001','T002']);
  terminal(f,'T001',{status:'FAIL'});
  f.context.history.at(-1).failureClass=failureClass;
  f.context.jobs=[];
  const r=evaluate(f,[]);
  expect(r.value.ready).not.toContain('T001');
  expect(r.value.running).not.toContain('T001');
  expect(r.value.completed).not.toContain('T001');
  expect(r.value.blocked).toContainEqual(expect.objectContaining({taskId:'T001',codes:expect.any(Array)}));
  expect(r.value.complete).toBe(false);
  expect(r.value.ready).toContain('T002');
  partition(r,['T001','T002']);
 });
 it.each(['solution','model-capability'])('blocks after three eligible terminal attempts when current job and return observations are absent (%s)',failureClass=>{
  const f=fixture(['T001','T002']);
  for(let attempt=1;attempt<=3;attempt++){
   terminal(f,'T001',{status:'FAIL',attempt});
   f.context.history.at(-1).failureClass=failureClass;
  }
  f.context.jobs=[];
  const r=evaluate(f,[]);
  expect(r.ok).toBe(true);
  expect(r.errors).toEqual([]);
  expect(r.value).not.toBeNull();
  expect(r.value.ready).not.toContain('T001');
  expect(r.value.running).not.toContain('T001');
  expect(r.value.completed).not.toContain('T001');
  expect(r.value.blocked).toContainEqual(expect.objectContaining({taskId:'T001',codes:expect.arrayContaining(['ATTEMPTS_EXHAUSTED'])}));
  expect(r.value.ready).toEqual(['T002']);
  expect(r.value.complete).toBe(false);
  partition(r,['T001','T002']);
 });
 it('fails closed when one global resource ID has conflicting physical observations across writers',()=>{
  const f=conflictingGlobalResourceObservation();
  code(validate(f),'E_RESOURCE',{global:true});
  const r=evaluate(f);
  code(r,'E_RESOURCE',{global:true});
 });

 it('releases a shared writer resource after a trusted terminal PASS return',()=>{
  const f=fixture(['T001','T002']);
  resource(f,'T001','WriterA','C:/fixture/shared');
  resource(f,'T002','WriterB','C:/fixture/shared');
  const a=terminal(f,'T001',{status:'PASS'});
  const r=evaluate(f,[a]);
  valid(r);
  expect(r.value.ready).toEqual(['T002']);
  expect(r.value.running).toEqual([]);
  expect(r.value.completed).toEqual(['T001']);
  expect(r.value.blocked).toEqual([]);
  expect(r.value.complete).toBe(false);
  partition(r,['T001','T002']);
 });

 it('accepts descendants below the POSIX filesystem root',()=>{
  const f=rootResource({platform:'posix',caseSensitive:true,allowedRoot:'/',path:'/tmp/shared',parentRealPath:'/tmp'});
  valid(validate(f));
  const r=evaluate(f);
  valid(r);
  expect(r.value.ready).toEqual(['T001']);
  expect(r.value.running).toEqual([]);
  expect(r.value.completed).toEqual([]);
  expect(r.value.blocked).toEqual([]);
  expect(r.value.complete).toBe(false);
  partition(r,['T001']);
 });

 it('accepts descendants below the Windows C:/ filesystem root',()=>{
  const f=rootResource({platform:'win32',caseSensitive:false,allowedRoot:'C:/',path:'C:/tmp/shared',parentRealPath:'C:/tmp'});
  valid(validate(f));
  const r=evaluate(f);
  valid(r);
  expect(r.value.ready).toEqual(['T001']);
  expect(r.value.running).toEqual([]);
  expect(r.value.completed).toEqual([]);
  expect(r.value.blocked).toEqual([]);
  expect(r.value.complete).toBe(false);
  partition(r,['T001']);
 });

 it('rejects traversal through the POSIX filesystem root',()=>{
  expectUnsafeRoot(rootResource({platform:'posix',caseSensitive:true,allowedRoot:'/',path:'/../escape',parentRealPath:'/'}));
 });

 it('rejects traversal through the Windows C:/ filesystem root',()=>{
  expectUnsafeRoot(rootResource({platform:'win32',caseSensitive:false,allowedRoot:'C:/',path:'C:/../escape',parentRealPath:'C:/'}));
 });

 it('rejects a resource on another Windows drive despite a C:/ root',()=>{
  expectUnsafeRoot(rootResource({platform:'win32',caseSensitive:false,allowedRoot:'C:/',path:'D:/tmp/shared',parentRealPath:'D:/tmp'}));
 });

 it('rejects a POSIX sibling-prefix resource outside the allowed child root',()=>{
  expectUnsafeRoot(rootResource({platform:'posix',caseSensitive:true,allowedRoot:'/tmp',path:'/tmp-other/shared',parentRealPath:'/tmp-other'}));
 });

 it('rejects a Windows sibling-prefix resource outside the allowed child root',()=>{
  expectUnsafeRoot(rootResource({platform:'win32',caseSensitive:false,allowedRoot:'C:/tmp',path:'C:/tmp-other/shared',parentRealPath:'C:/tmp-other'}));
 });
});
