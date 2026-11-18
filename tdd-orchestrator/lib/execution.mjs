import {createHash} from 'node:crypto';

// Caller observations are trusted inputs, not filesystem or scheduler operations.
const id = v => typeof v === 'string' && v.length > 0 && v.trim() === v && !/[\x00-\x1f\x7f]/.test(v);
const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = v => Number.isSafeInteger(v);
const bool = v => typeof v === 'boolean';
const nullable = rule => v => v === null || rule(v);
const one = (...values) => v => values.includes(v);
const array = rule => v => Array.isArray(v) && Object.keys(v).length === v.length && v.every(rule);
const object = fields => v => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === Object.keys(fields).length && Object.entries(fields).every(([k,r]) => Object.hasOwn(v,k) && r(v[k]));
const relative = v => id(v) && !v.startsWith('/') && !v.includes('\\') && !v.includes(':') && v.split('/').every(s => s && s !== '.' && s !== '..' && s.toLowerCase() !== '.git');
const proof = object({path:relative,sha256:hash});
const resource = object({id,path:id,kind:one('file','directory','cache','output','state')});
const task = object({id,owner:id,dependencies:array(id),resources:array(object({id,access:one('read','write')})),artifacts:array(relative),isolated:bool});
const planSchema = object({schemaVersion:one(1),runId:id,wave:integer,revision:id,staticDigest:hash,resources:array(resource),tasks:array(task)});
const status = one('RUNNING','PASS','FAIL','CANCELLED');
const retSchema = object({taskId:id,wave:integer,runId:id,revision:id,staticDigest:hash,attempt:integer,instanceId:id,jobId:id,owner:id,status,dependencies:array(object({taskId:id,returnDigest:hash})),artifacts:array(object({path:relative,sha256:hash})),returnDigest:hash,source:proof});
const attemptSchema = object({runId:id,wave:integer,taskId:id,attempt:integer,instanceId:id,jobId:id,owner:id,status,failureClass:nullable(one('solution','model-capability','auth','network','quota','tooling','configuration','cancelled')),startSequence:integer,terminalSequence:nullable(integer),revision:id,staticDigest:hash,returnDigest:nullable(hash),source:proof});
const jobSchema = object({runId:id,revision:id,staticDigest:hash,taskId:id,attempt:integer,instanceId:id,jobId:id,owner:id,state:one('RUNNING','TERMINAL','UNKNOWN'),terminalStatus:nullable(one('PASS','FAIL','CANCELLED')),source:proof});
const contextSchema = object({schemaVersion:one(1),observationId:id,runId:id,wave:integer,revision:id,expectedStaticDigest:hash,environmentDigest:hash,source:proof,
  filesystem:object({platform:one('win32','posix'),caseSensitive:bool,allowedRoots:array(id),resources:array(object({resourceId:id,taskId:id,realPath:id,parentRealPath:id,exists:bool,directory:bool,symlink:bool,device:nullable(id),inode:nullable(id),linkCount:integer,source:proof}))}),
  capacity:object({maxWorkers:integer,activeWorkers:integer,writerSlots:integer,activeWriterTaskIds:array(id)}),
  isolation:object({available:bool,observations:array(object({taskId:id,instanceId:id,worktreeRoot:id,resourceIds:array(id),verified:bool,source:proof}))}),
  jobs:array(jobSchema),history:array(attemptSchema),predecessors:array(object({taskId:id,expectedRevision:id,expectedStaticDigest:hash,expectedReturnDigest:hash,source:proof,result:retSchema})),
  artifacts:array(object({path:relative,sha256:hash,regular:bool,confined:bool,source:proof})),
  integratedReview:object({status:one('PENDING','PASS','FAIL'),runId:id,revision:id,staticDigest:hash,environmentDigest:hash,author:nullable(id),reviewer:nullable(id),independent:bool,source:nullable(proof)})});
const cmp = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const byId = (a,b) => cmp(a.id,b.id);
const sorted = a => [...a].sort(cmp);
const unique = a => new Set(a.map(x=>x.toLowerCase())).size === a.length;
const equalSet = (a,b) => unique(a) && unique(b) && JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const canonical = v => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const digest = v => createHash('sha256').update(canonical(v),'utf8').digest('hex');
const diagnostic = (code,path='',taskId=null) => ({code,path,taskId,message:`Execution validation failed: ${code}.`});
const envelope = (errors,value) => {const all=[...new Map(errors.map(e=>[canonical(e),e])).values()].sort((a,b)=>cmp(a.path,b.path)||cmp(a.code,b.code)||cmp(a.taskId??'',b.taskId??'')||cmp(a.message,b.message));return {ok:all.length===0,errors:all,value};};
export class ExecutionError extends Error {constructor(errors){const result=envelope(errors,null);super(result.errors[0].message);this.name='ExecutionError';this.code=result.errors[0].code;this.errors=result.errors;}}

function staticCheck(p,q) {
  const fail = c => {throw new ExecutionError([diagnostic(c)]);};
  if (!p || p.schema_version!=='2.3' || !id(p.run_id) || !id(p.task_source) || !id(p.repo?.head_current) || !id(p.contract?.file) || !id(p.contract?.version) || !array(v=>v&&id(v.id)&&id(v.desc)&&id(v.source)&&array(id)(v.tasks)&&(v.type===undefined||one('behavioral','normative')(v.type)))(p.acceptance_criteria) || !array(w=>w&&integer(w.wave)&&w.wave>0&&array(t=>t&&id(t.id)&&id(t.title)&&array(id)(t.allowed_write_globs)&&array(id)(t.acceptance_criteria))(w.tasks))(p.waves)) fail('E_PROGRESS');
  const ids=p.waves.flatMap(w=>w.tasks.map(t=>t.id)),acs=p.acceptance_criteria.map(a=>a.id);
  if(!unique(ids)||!unique(acs)||new Set(p.waves.map(w=>w.wave)).size!==p.waves.length||p.waves.some(w=>w.tasks.some(t=>!unique(t.acceptance_criteria)||t.acceptance_criteria.some(a=>!acs.includes(a))))||p.acceptance_criteria.some(a=>!unique(a.tasks)||a.tasks.some(t=>!ids.includes(t)))) fail('E_PROGRESS');
  if(!planSchema(q)||q.wave<1) fail('E_SCHEMA');
  const wave=p.waves.find(w=>w.wave===q.wave);if(!wave) fail('E_TASK_SET');
  if(q.runId!==p.run_id||q.revision!==p.repo.head_current) fail('E_BINDING');
  return wave;
}
export function staticExecutionDigest(p,q) {
  const wave=staticCheck(p,q);
  return digest({schemaVersion:1,progress:{schema_version:p.schema_version,run_id:p.run_id,task_source:p.task_source,contract:{file:p.contract.file,version:p.contract.version},criteria:p.acceptance_criteria.map(({id,desc,source,tasks,type})=>({id,desc,source,tasks:sorted(tasks),type:type??'behavioral'})).sort(byId),wave:{wave:wave.wave,tasks:wave.tasks.map(t=>({id:t.id,title:t.title,allowed_write_globs:sorted(t.allowed_write_globs),acceptance_criteria:sorted(t.acceptance_criteria)})).sort(byId)}},plan:{schemaVersion:q.schemaVersion,runId:q.runId,wave:q.wave,revision:q.revision,resources:[...q.resources].sort(byId),tasks:q.tasks.map(t=>({...t,dependencies:sorted(t.dependencies),resources:[...t.resources].sort((a,b)=>cmp(a.id,b.id)||cmp(a.access,b.access)),artifacts:sorted(t.artifacts)})).sort(byId)}});
}
function paths(c) {
  const fs=c.filesystem,fold=p=>fs.caseSensitive?p:p.toLowerCase();
  const absolute=p=>{
    if(!id(p)||p.includes('\\')||p.includes('//'))return false;
    const root=fs.platform==='win32'?/^[A-Za-z]:\//.test(p):p.startsWith('/');
    if(!root)return false;
    const tail=fs.platform==='win32'?p.slice(3):p.slice(1);
    return tail===''||tail.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!/[\x00-\x1f\x7f]/.test(s)&&(fs.platform!=='win32'||!/[. ]$/.test(s)));
  };
  const inside=(p,r)=>fold(p)===fold(r)||(r.endsWith('/')?fold(p).startsWith(fold(r)):fold(p).startsWith(`${fold(r)}/`));
  const confined=p=>absolute(p)&&fs.allowedRoots.some(r=>inside(p,r));
  return {fold,absolute,inside,confined};
}
function overlap(a,b,ps){return ps.fold(a.realPath)===ps.fold(b.realPath)||(a.exists&&b.exists&&a.device===b.device&&a.inode===b.inode)||(a.directory&&ps.inside(b.realPath,a.realPath))||(b.directory&&ps.inside(a.realPath,b.realPath));}
function base(p,q,c) {
  const errors=[],add=(code,path='',tid=null)=>errors.push(diagnostic(code,path,tid));
  let wave,h;try{wave=staticCheck(p,q);h=staticExecutionDigest(p,q);}catch(e){return envelope(e instanceof ExecutionError?e.errors:[diagnostic('E_SCHEMA')],null);}
  if(!contextSchema(c))return envelope([diagnostic('E_SCHEMA','/context')],null);
  if(!equalSet(q.tasks.map(t=>t.id),wave.tasks.map(t=>t.id)))add('E_TASK_SET');
  if(c.runId!==q.runId||c.wave!==q.wave||c.revision!==q.revision||q.staticDigest!==h||c.expectedStaticDigest!==h)add('E_BINDING');
  const all=new Map(p.waves.flatMap(w=>w.tasks.map(t=>[t.id,{...t,wave:w.wave}]))), tasks=new Map(q.tasks.map(t=>[t.id,t]));
  for(const t of q.tasks){if(!unique(t.dependencies)||t.dependencies.some(d=>d===t.id||!all.has(d)||all.get(d).wave>q.wave))add('E_DEPENDENCY','/plan/tasks',t.id);if(!unique(t.resources.map(r=>r.id))||!unique(t.artifacts))add('E_RESOURCE','/plan/tasks',t.id);}
  const visiting=new Set(),visited=new Set();function visit(t){if(visiting.has(t.id)){add('E_CYCLE');return;}if(visited.has(t.id))return;visiting.add(t.id);for(const d of t.dependencies)if(tasks.has(d))visit(tasks.get(d));visiting.delete(t.id);visited.add(t.id);}q.tasks.forEach(visit);
  const ps=paths(c),refs=q.tasks.flatMap(t=>t.resources.map(r=>({...r,taskId:t.id}))),rs=new Map(q.resources.map(r=>[r.id,r]));
  if(!unique(q.resources.map(r=>r.id))||!equalSet(q.resources.map(r=>r.id),[...new Set(refs.map(r=>r.id))])||!c.filesystem.allowedRoots.length||c.filesystem.allowedRoots.some(r=>!ps.absolute(r)))add('E_RESOURCE');
  if(q.resources.some(r=>!ps.confined(r.path)))add('E_RESOURCE');
  const obs=c.filesystem.resources;
  const sourceValid=s=>!!s&&c.artifacts.filter(a=>a.path===s.path&&a.sha256===s.sha256&&a.regular&&a.confined).length===1;
  if(obs.length!==refs.length||refs.some(r=>obs.filter(o=>o.taskId===r.taskId&&o.resourceId===r.id).length!==1)||obs.some(o=>!refs.some(r=>r.taskId===o.taskId&&r.id===o.resourceId)))add('E_RESOURCE');
  for(const o of obs){const r=rs.get(o.resourceId);if(!r||!ps.confined(o.realPath)||!ps.confined(o.parentRealPath)||!ps.inside(o.realPath,o.parentRealPath)||!sourceValid(o.source)||(o.exists?(!o.device||!o.inode||o.linkCount<1):(o.device!==null||o.inode!==null||o.linkCount!==0))||(r.kind==='file'&&o.directory)||(r.kind==='directory'&&!o.directory))add('E_RESOURCE');}
  const cap=c.capacity;if(cap.maxWorkers<1||cap.activeWorkers<0||cap.activeWorkers>cap.maxWorkers||cap.writerSlots<0||!unique(cap.activeWriterTaskIds)||cap.activeWriterTaskIds.some(t=>!tasks.has(t)||!tasks.get(t).resources.some(r=>r.access==='write')||!c.jobs.some(j=>j.taskId===t&&j.state==='RUNNING')))add('E_CAPACITY');
  if(errors.length)return envelope(errors,null);
  const conflicts=[];
  for(let i=0;i<q.tasks.length;i++)for(let j=i+1;j<q.tasks.length;j++){const a=q.tasks[i],b=q.tasks[j],ids=new Set();for(const ar of a.resources)for(const br of b.resources){if(ar.access==='read'&&br.access==='read')continue;const ao=obs.find(o=>o.taskId===a.id&&o.resourceId===ar.id),bo=obs.find(o=>o.taskId===b.id&&o.resourceId===br.id);if(overlap(ao,bo,ps)){ids.add(ar.id);ids.add(br.id);}}if(ids.size){const [left,right]=sorted([a.id,b.id]);conflicts.push({left,right,resourceIds:sorted([...ids])});}}
  conflicts.sort((a,b)=>cmp(a.left,b.left)||cmp(a.right,b.right));
  for(const t of q.tasks)if(t.isolated){const writes=t.resources.filter(r=>r.access==='write').map(r=>r.id),matching=c.isolation.observations.filter(o=>o.taskId===t.id),latest=c.history.filter(a=>a.taskId===t.id).sort((a,b)=>a.attempt-b.attempt).at(-1);if(!c.isolation.available||matching.length!==1||!matching[0].verified||!ps.confined(matching[0].worktreeRoot)||!equalSet(matching[0].resourceIds,writes)||!sourceValid(matching[0].source)||(latest?.instanceId&&matching[0].instanceId!==latest.instanceId))add('E_ISOLATION','/context/isolation',t.id);}
  return envelope(errors,{runId:q.runId,wave:q.wave,revision:q.revision,staticDigest:h,taskIds:sorted(q.tasks.map(t=>t.id)),conflicts});
}
export function validateExecutionPlan(p,q,c){try{return base(p,q,c);}catch{return envelope([diagnostic('E_SCHEMA')],null);}}
function returnHash(r){const {returnDigest,source,...body}=r;return digest({...body,dependencies:[...body.dependencies].sort((a,b)=>cmp(a.taskId,b.taskId)),artifacts:[...body.artifacts].sort((a,b)=>cmp(a.path,b.path))});}

export function evaluateExecution(p,q,returns,c) {
  const initial=validateExecutionPlan(p,q,c);if(!initial.value)return initial;
  if(!array(retSchema)(returns))return envelope([diagnostic('E_SCHEMA','/returns')],null);
  const errors=[...initial.errors],blocked=new Map(q.tasks.map(t=>[t.id,new Set()])),tasks=new Map(q.tasks.map(t=>[t.id,t])),all=new Map(p.waves.flatMap(w=>w.tasks.map(t=>[t.id,{...t,wave:w.wave}])));
  const add=(code,tid,path='/context')=>{errors.push(diagnostic(code,path,tid));if(blocked.has(tid))blocked.get(tid).add(code);};
  const sourceValid=s=>!!s&&c.artifacts.filter(a=>a.path===s.path&&a.sha256===s.sha256&&a.regular&&a.confined).length===1;
  if(!sourceValid(c.source))for(const t of q.tasks)add('E_ARTIFACT',t.id);
  for(const e of initial.errors)if(e.taskId)blocked.get(e.taskId).add('ISOLATION_UNPROVEN');
  const histories=new Map(),jobs=new Map(),usedInstances=new Set(),usedJobs=new Set();
  for(const h of c.history){if(!all.has(h.taskId)){add('E_HISTORY',null);continue;}if(!histories.has(h.taskId))histories.set(h.taskId,[]);histories.get(h.taskId).push(h);}
  for(const [tid,hs] of histories){hs.sort((a,b)=>a.attempt-b.attempt);let prev=null;for(let i=0;i<hs.length;i++){const h=hs[i],owner=tasks.get(tid)?.owner??hs[0].owner;const active=h.status==='RUNNING';if(h.attempt!==i+1||h.attempt>3||h.runId!==q.runId||h.wave!==all.get(tid).wave||h.owner!==owner||h.startSequence<0||(active?(h.terminalSequence!==null||h.failureClass!==null||h.returnDigest!==null):(h.terminalSequence===null||h.terminalSequence<=h.startSequence||(h.status==='PASS'?h.failureClass!==null:h.status==='CANCELLED'?h.failureClass!=='cancelled':h.failureClass===null||h.failureClass==='cancelled')))||(prev&&(prev.terminalSequence===null||prev.terminalSequence>=h.startSequence))||usedInstances.has(h.instanceId.toLowerCase())||usedJobs.has(h.jobId.toLowerCase())||!sourceValid(h.source))add('E_HISTORY',tid);usedInstances.add(h.instanceId.toLowerCase());usedJobs.add(h.jobId.toLowerCase());prev=h;}}
  for(const j of c.jobs){const duplicate=jobs.has(j.taskId);if(duplicate)add('E_JOB',j.taskId);jobs.set(j.taskId,j);const h=histories.get(j.taskId)?.at(-1),valid=!duplicate&&!!h&&['runId','revision','staticDigest','taskId','attempt','instanceId','jobId','owner'].every(k=>j[k]===h[k])&&j.state!=='UNKNOWN'&&(h.status==='RUNNING'?(j.state==='RUNNING'&&j.terminalStatus===null):(j.state==='TERMINAL'&&j.terminalStatus===h.status))&&sourceValid(j.source);if(!valid){add('E_JOB',j.taskId);blocked.get(j.taskId)?.add('E_JOB');}}
  for(const [tid,hs] of histories){if(hs.at(-1)?.status==='RUNNING'&&!jobs.has(tid)){add('E_JOB',tid);blocked.get(tid)?.add('E_JOB');}}
  const current=new Map();for(const r of returns){if(!tasks.has(r.taskId)){add('E_RETURN_SET',null,'/returns');continue;}if(current.has(r.taskId))add('E_RETURN_SET',r.taskId,'/returns');else current.set(r.taskId,r);}
  const state=new Map(),pass=new Map();
  const artifactValid=(r,expected)=>equalSet(r.artifacts.map(a=>a.path),expected)&&r.artifacts.every(a=>c.artifacts.filter(o=>o.path===a.path&&o.sha256===a.sha256&&o.regular&&o.confined&&sourceValid(o.source)).length===1)&&sourceValid(r.source);
  function checkReturn(r,revision,staticDigest,expectedArtifacts,tid){const j=jobs.get(r.taskId),h=histories.get(r.taskId)?.at(-1);let valid=true;const reject=code=>{add(code,tid,'/returns');valid=false;};if(r.runId!==q.runId||r.wave!==all.get(r.taskId)?.wave||r.revision!==revision||r.staticDigest!==staticDigest||r.returnDigest!==returnHash(r)||(h&&h.status!=='RUNNING'&&h.returnDigest!==r.returnDigest))reject('E_RETURN_STALE');if(!j||!h||!['runId','revision','staticDigest','taskId','attempt','instanceId','jobId','owner'].every(k=>r[k]===j[k])||r.owner!==(tasks.get(r.taskId)?.owner??h.owner)||r.status!==h.status||(r.status==='RUNNING'?j.state!=='RUNNING':j.state!=='TERMINAL'||j.terminalStatus!==r.status))reject('E_JOB');if(!artifactValid(r,expectedArtifacts))reject('E_ARTIFACT');if(r.status==='FAIL'||r.status==='CANCELLED')reject('E_TASK_FAILED');if(blocked.get(r.taskId)?.size)valid=false;return valid&&r.status==='PASS';}
  const requiredPrior=[...new Set(q.tasks.flatMap(t=>t.dependencies.filter(d=>!tasks.has(d))))];
  // Non-terminal writer attempts retain occupancy until a trusted terminal return.
  const occupied=new Set([...c.capacity.activeWriterTaskIds,...c.jobs.filter(j=>j.state==='RUNNING').map(j=>j.taskId)]);
  for(const [tid,hs] of histories)if(hs.at(-1)?.status==='RUNNING'&&tasks.get(tid)?.resources.some(r=>r.access==='write'))occupied.add(tid);
  const prior=new Map();for(const d of requiredPrior){const wrappers=c.predecessors.filter(o=>o.taskId===d),w=wrappers[0];let valid=wrappers.length===1&&w.result.taskId===d&&w.result.revision===w.expectedRevision&&w.result.staticDigest===w.expectedStaticDigest&&w.result.returnDigest===w.expectedReturnDigest&&sourceValid(w.source);if(valid)valid=checkReturn(w.result,w.expectedRevision,w.expectedStaticDigest,w.result.artifacts.map(a=>a.path),null);prior.set(d,valid?w.result:null);}
  if(c.predecessors.some(o=>!requiredPrior.includes(o.taskId)))add('E_PREDECESSOR',null);
  function resolve(tid,seen=new Set()){if(state.has(tid))return state.get(tid);if(seen.has(tid))return 'blocked';seen.add(tid);const t=tasks.get(tid),r=current.get(tid),j=jobs.get(tid),hs=histories.get(tid)??[],h=hs.at(-1),codes=blocked.get(tid);let dependencies=true;
    for(const d of t.dependencies){const dep=tasks.has(d)?(resolve(d,new Set(seen))==='completed'?pass.get(d):null):prior.get(d);if(!dep){dependencies=false;const failed=tasks.has(d)&&(blocked.get(d).size>0||current.get(d)?.status==='FAIL'||current.get(d)?.status==='CANCELLED');codes.add(failed?'DEPENDENCY_FAILED':'DEPENDENCY_PENDING');if(!tasks.has(d))add('E_PREDECESSOR',tid);}}
    if(r){const good=checkReturn(r,q.revision,q.staticDigest,t.artifacts,tid);if(!equalSet(r.dependencies.map(d=>d.taskId),t.dependencies)||r.dependencies.some(d=>{const dep=tasks.has(d.taskId)?pass.get(d.taskId):prior.get(d.taskId);return !dep||d.returnDigest!==dep.returnDigest;}))add('E_PREDECESSOR',tid);if(good&&dependencies&&codes.size===0){state.set(tid,'completed');pass.set(tid,r);return 'completed';}if(r.status==='RUNNING'&&codes.size===0){state.set(tid,'running');return 'running';}}
    else if(j?.state==='TERMINAL'){add('E_RETURN_MISSING',tid);if(hs.length>=3)codes.add('ATTEMPTS_EXHAUSTED');}
    else if(j?.state==='RUNNING'&&codes.size===0){state.set(tid,'running');return 'running';}
    if(!r&&!j&&h?.status==='RUNNING')codes.add('ATTEMPT_RUNNING');
    if(!r&&hs.length>=3)codes.add('ATTEMPTS_EXHAUSTED');
    if(!r&&!j&&c.capacity.activeWorkers>=c.capacity.maxWorkers)codes.add('CAPACITY');
    if(!r&&!j&&t.resources.some(r=>r.access==='write')&&c.capacity.writerSlots===0)codes.add('CAPACITY');
    if(!r&&!j&&initial.value.conflicts.some(pair=>(pair.left===tid&&occupied.has(pair.right))||(pair.right===tid&&occupied.has(pair.left))))codes.add('RESOURCE_BUSY');
    const s=codes.size?'blocked':'ready';state.set(tid,s);return s;
  }
  for(const tid of initial.value.taskIds)resolve(tid);
  const view={...initial.value,ready:[],running:[],completed:[],blocked:[],complete:false};for(const tid of initial.value.taskIds){const s=state.get(tid);if(s==='blocked')view.blocked.push({taskId:tid,codes:sorted([...blocked.get(tid)])});else view[s].push(tid);}
  if(view.completed.length===q.tasks.length&&returns.length===q.tasks.length&&errors.length===0){const r=c.integratedReview;if(r.status!=='PASS'||!r.independent||!r.author||!r.reviewer||r.author===r.reviewer||r.runId!==q.runId||r.revision!==q.revision||r.staticDigest!==q.staticDigest||r.environmentDigest!==c.environmentDigest||!sourceValid(r.source))add('E_REVIEW_STALE',null);else view.complete=true;}
  return envelope(errors,view);
}
