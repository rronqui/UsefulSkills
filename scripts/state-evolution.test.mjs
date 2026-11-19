import {test} from 'vitest';
import assert from 'node:assert/strict';
import {GATES,validateCriteriaMatrix,validateProgress,migrateProgress,canPromoteWave} from '../tdd-orchestrator/lib/state.mjs';

// Synthetic contract fixtures only; these strings do not claim product execution.
const na=id=>({status:'NA',reason:'fixture normative clause',validator:'spec-kit-validator',evidence:'fixture contract clause',reference:`spec.md#${id}`});
const metadata=(id,type)=>({id,desc:'fixture criterion',source:`./specs/specs001-fixture/spec.md#${id}`,tasks:['T001'],status:'VALIDATED',...(type===undefined?{}:{type})});
function fixture(id='AC-001',type) {
 const task={id:'T001',title:'fixture existing behavior',phase:'DONE',attempt:0,allowed_write_globs:['src/a.mjs'],acceptance_criteria:[id],implemented_by:'existing-code',reviewed_by:'peer-reviewer',review:{status:'APPROVED',agent:'peer-reviewer',independent:true,revision:'fixture-head',evidence:'fixture independent review'},red:{status:'PASS',failing_tests:[],failure_reason_expected:false,criteria_to_tests:{[id]:type==='normative'?na(id):['fixture.test.mjs::behavior']},revision_delta:{ac:'',test:'',evidence:''},revision_baseline_tests:{}},green:{status:'SKIPPED',reason_if_skipped:'fixture behavior already implemented',changed_files:[],tooling_evidence:'',tooling_suite_evidence:''},refactor:{status:'SKIPPED',reason_if_skipped:'fixture no changes'},doc_impact:'none',gates:Object.fromEntries(GATES.map(g=>[g,'PASS'])),gate_origins:Object.fromEntries(GATES.map(g=>[g,''])),gate_evidence:Object.fromEntries(GATES.map(g=>[g,g==='spec_kit'?'fixture spec.md plan.md tasks.md interface-contract.md':'fixture gate proof'])),blockers:[],evidence:'fixture existing behavior inspected'};
 return {schema_version:'2.3',run_id:'fixture-only',task_source:'synthetic unit fixture',updated_at:'2026-11-08T00:00:00Z',repo:{branch_start:'main',branch_work:'fixture',merge_target:'main',delivery:'internal',merge_status:'',pr_url:'',head_start:'fixture-head',head_current:'fixture-head',dirty_at_start:false},baseline:{status:'PASS',tests:'PASS',tests_evidence:'fixture tests',build:'PASS',build_evidence:'fixture build',override_approved:false,known_failures:[]},spec_kit:{spec:'./specs/specs001-fixture/spec.md',plan:'./specs/specs001-fixture/plan.md',tasks:'./specs/specs001-fixture/tasks.md',status:'WRITTEN',written_at:'2026-11-08T00:00:00Z',mode:'created'},contract:{file:'./specs/specs001-fixture/contracts/interface-contract.md',version:'1.0.0',status:'APPROVED',na_reason:''},acceptance_criteria:[metadata(id,type)],waves:[{wave:1,status:'in_progress',integration:{status:'pending',attempt:0,evidence:''},tasks:[task]}]};
}
const taskOf=p=>p.waves[0].tasks[0];
const expectValid=result=>assert.equal(result.ok,true,JSON.stringify(result.errors));
function current23RedRevisionFixture() {
 const progress=fixture();
 const task=taskOf(progress);
 const baselineRef='scripts/state-evolution.test.mjs::AC-003 — RED_REVISION com baseline fornecida inválida bloqueia sem substituir diagnóstico';
 const deltaRef='scripts/state-evolution.test.mjs::AC-003 schema 2.3 valid RED_REVISION roundtrip preserves current proof exactly';
 task.phase='RED_REVISION';
 task.attempt=2;
 task.blockers=['schema 2.3 current diagnostic'];
 task.evidence='schema 2.3 current RED_REVISION assertion evidence';
 task.red={
  status:'PASS',
  failing_tests:[deltaRef],
  failure_reason_expected:true,
  criteria_to_tests:{'AC-001':[baselineRef,deltaRef]},
  revision_delta:{ac:'AC-001',test:deltaRef,evidence:'assertion failed: current schema 2.3 proof changed'},
  revision_baseline_tests:{'AC-001':[baselineRef]},
 };
 progress.waves[0].integration={status:'FAIL',attempt:2,evidence:'schema 2.3 integration retry history'};
 task.gates.tests='FAIL';
 task.gate_origins.tests='TESTE';
 task.gate_evidence.tests='fixture tests; output: FAIL';
 return progress;
}
test('AC-006: existing behavior passes REVIEW, DOC, VALIDATE and DONE without inventing GREEN implementation',()=>{
 for(const phase of ['REVIEW','DOC','VALIDATE','DONE']) {
  const p=fixture();taskOf(p).phase=phase;expectValid(validateProgress(p));
  assert.equal(taskOf(p).green.status,'SKIPPED');assert.deepEqual(taskOf(p).green.changed_files,[]);
 }
});
test('AC-006: existing-code completion preserves review, gate, acceptance and no-change requirements',()=>{
 const mutations=[
  t=>{t.review.independent=false;},t=>{t.review.status='BLOCKED';},
  t=>{t.gate_evidence.tests='';},t=>{t.gates.tests='pending';},
  t=>{t.blockers=['fixture unresolved issue'];},t=>{t.red.status='PENDING';},
  t=>{t.red.failing_tests=['fixture.test.mjs::behavior'];},t=>{t.red.failure_reason_expected=true;},
  t=>{t.green.changed_files=['src/a.mjs'];},t=>{t.green.status='PASS';},
  t=>{t.refactor.status='PASS';},t=>{t.green.reason_if_skipped='';},t=>{t.evidence='';},
 ];
 for(const [index,mutate] of mutations.entries()) {const p=fixture();mutate(taskOf(p));assert.equal(validateProgress(p).ok,false,`mutation ${index}`);}
 const p=fixture();p.acceptance_criteria[0].status='COVERED';assert.equal(validateProgress(p).ok,false);
});
test('AC-006: normative type works for different criterion IDs without renumbering',()=>{
 for(const id of ['AC-016','AC-019','AC-201']) {
  const p=fixture(id,'normative');expectValid(validateProgress(p));
  expectValid(validateCriteriaMatrix(taskOf(p),{acceptanceCriteria:p.acceptance_criteria}));
 }
});
test('AC-006: AC-019 is behavioral unless explicitly typed normative',()=>{
 for(const type of [undefined,'behavioral']) {
  const p=fixture('AC-019',type);expectValid(validateProgress(p));
  expectValid(validateCriteriaMatrix(taskOf(p),{acceptanceCriteria:p.acceptance_criteria}));
  taskOf(p).red.criteria_to_tests['AC-019']=na('AC-019');assert.equal(validateProgress(p).ok,false);
  assert.equal(validateCriteriaMatrix(taskOf(p)).ok,false);
 }
});

test('Review09-01: several normative ACs complete and promote with independent proofs for every AC',()=>{
 const p=fixture('AC-016','normative'),t=taskOf(p);t.implemented_by='spec-kit-author';
 p.acceptance_criteria.push(metadata('AC-019','normative'));t.acceptance_criteria.push('AC-019');t.red.criteria_to_tests['AC-019']=na('AC-019');
 expectValid(validateProgress(p));expectValid(canPromoteWave(promotion(p),{acceptanceCriteria:p.acceptance_criteria}));
 for(const mutate of [x=>{delete taskOf(x).red.criteria_to_tests['AC-019'];},x=>{taskOf(x).red.criteria_to_tests['AC-019'].reference='spec.md#AC-016';},x=>{taskOf(x).review.independent=false;}]) {
  const bad=structuredClone(p);mutate(bad);assert.equal(validateProgress(bad).ok,false);
 }
});

test('Review01-05: normative references require the exact AC token',()=>{
 for(const reference of ['spec.md#AC-0160','spec.md#AC-016-suffix','spec.md#XAC-016','spec.md#AC-016_extra']) {
  const p=fixture('AC-016','normative');taskOf(p).red.criteria_to_tests['AC-016'].reference=reference;
  assert.equal(validateProgress(p).ok,false,reference);
 }
 const p=fixture('AC-016','normative');taskOf(p).red.criteria_to_tests['AC-016'].reference='contract clause (AC-016)';expectValid(validateProgress(p));
});

test('Review01-04: Spec Kit evidence requires document basename boundaries',()=>{
 const p=fixture();taskOf(p).gate_evidence.spec_kit='checked ./specs/specs001-fixture/spec.md#AC-001, ./specs/specs001-fixture/plan.md; tasks.md and contracts/interface-contract.md';expectValid(validateProgress(p));
 for(const file of ['spec.md','plan.md','tasks.md','interface-contract.md']) for(const replacement of [`not-${file}`,`${file}.bak`]) {
  const bad=fixture();taskOf(bad).gate_evidence.spec_kit=taskOf(bad).gate_evidence.spec_kit.replace(file,replacement);
  assert.equal(validateProgress(bad).ok,false,replacement);
 }
});
test('AC-006: unknown type and incomplete, spoofed or mixed normative proofs fail closed',()=>{
 for(const type of ['unknown','',null]) {const p=fixture('AC-016',type);assert.equal(validateProgress(p).ok,false);}
 for(const field of ['reason','validator','evidence','reference']) {
  const p=fixture('AC-016','normative');taskOf(p).red.criteria_to_tests['AC-016'][field]='';assert.equal(validateProgress(p).ok,false);
 }
 for(const update of [{validator:'validator'},{reference:'spec.md#AC-019'},{extra:'x'}]) {
  const p=fixture('AC-016','normative');Object.assign(taskOf(p).red.criteria_to_tests['AC-016'],update);assert.equal(validateProgress(p).ok,false);
 }
 const p=fixture('AC-016','normative');p.acceptance_criteria.push(metadata('AC-001','behavioral'));taskOf(p).acceptance_criteria.push('AC-001');taskOf(p).red.criteria_to_tests['AC-001']=['fixture.test.mjs::behavior'];assert.equal(validateProgress(p).ok,false);
});
test('AC-006: migration preserves behavioral AC-019 revision baseline and normative IDs/proofs',()=>{
 const p=fixture('AC-019','behavioral'),t=taskOf(p);t.phase='RED_REVISION';t.red.revision_baseline_tests={'AC-019':['fixture.test.mjs::behavior']};
 p.schema_version='2.2';
 const migrated=migrateProgress(p);expectValid(migrated);assert.deepEqual(taskOf(migrated.value).red.revision_baseline_tests,{'AC-019':['fixture.test.mjs::behavior']});
 const n=fixture('AC-016','normative');expectValid(migrateProgress(n));
 assert.deepEqual(migrateProgress(n).value.acceptance_criteria,n.acceptance_criteria);
 const legacy=fixture('AC-019');taskOf(legacy).red.criteria_to_tests['AC-019']=na('AC-019');assert.equal(migrateProgress(legacy).ok,false);
});
function promotion(p) {
 const wave=structuredClone(p.waves[0]);wave.status='integrating';wave.integration={status:'PASS',attempt:1,evidence:'fixture integration proof'};
 wave.review={status:'APPROVED',agent:'peer-reviewer',independent:true,revision:'fixture-head',evidence:'fixture wave review',aggregate:{status:'APPROVED',findings:[],blockers:[],counts:{P0:0,P1:0,P2:0,P3:0}}};
 wave.validation={status:'PASS',agent:'validator',suite:{command:'fixture suite command',output:'fixture PASS'},evidence:'fixture validator proof',gates:Object.fromEntries(GATES.map(g=>[g,{status:'PASS',command:'fixture command',output:g==='spec_kit'?'fixture PASS spec.md plan.md tasks.md interface-contract.md':'fixture PASS'}]))};return wave;
}
test('AC-006: wave promotion still enforces integration review and validation for existing behavior',()=>{
 const p=fixture();expectValid(canPromoteWave(promotion(p)));
 for(const modify of [w=>{w.integration.status='pending';},w=>{w.review.independent=false;},w=>{delete w.validation;}]) {
  const w=promotion(p);modify(w);assert.equal(canPromoteWave(w).ok,false);
 }
});
test('AC-006: standalone wave promotion receives normative metadata explicitly',()=>{
 const p=fixture('AC-016','normative'),w=promotion(p);expectValid(canPromoteWave(w,{acceptanceCriteria:p.acceptance_criteria}));
 assert.equal(canPromoteWave(w).ok,false);
});
test('AC-006: behavioral implementation still needs real RED and GREEN PASS',()=>{
 const p=fixture('AC-019','behavioral'),t=taskOf(p);t.implemented_by='backend-developer';
 t.refactor={status:'PASS',reason_if_skipped:''};t.green={...t.green,status:'PASS',reason_if_skipped:'',changed_files:['src/a.mjs']};
 t.red.failing_tests=['fixture.test.mjs::behavior'];t.red.failure_reason_expected=true;expectValid(validateProgress(p));
 t.green.status='SKIPPED';t.green.reason_if_skipped='fixture invalid skip';assert.equal(validateProgress(p).ok,false);
 t.green.status='PASS';t.red.failing_tests=[];assert.equal(validateProgress(p).ok,false);
});
test('AC-006: explicit normative exemption reaches DONE and promotion without using existing-code marker',()=>{
 const p=fixture('AC-016','normative');taskOf(p).implemented_by='spec-kit-author';expectValid(validateProgress(p));
 expectValid(canPromoteWave(promotion(p),{acceptanceCriteria:p.acceptance_criteria}));
 const migrated=migrateProgress(p);expectValid(migrated);assert.deepEqual(taskOf(migrated.value).red.criteria_to_tests,taskOf(p).red.criteria_to_tests);
});
test('AC-006: normative revision migration retains the original document proof',()=>{
 const p=fixture('AC-016','normative');taskOf(p).phase='RED_REVISION';
 p.schema_version='2.2';
 const migrated=migrateProgress(p);expectValid(migrated);
 assert.equal(taskOf(migrated.value).phase,'RED_REVISION');
 assert.deepEqual(taskOf(migrated.value).red.criteria_to_tests,taskOf(p).red.criteria_to_tests);
});
test('AC-006: standalone metadata rejects malformed, duplicated and unknown criterion types',()=>{
 const p=fixture('AC-016','normative');
 for(const acceptanceCriteria of [null,{},[{id:'AC-016',type:'unknown'}],[{id:'AC-016',type:'normative'},{id:'AC-016',type:'behavioral'}]]) {
  assert.equal(validateCriteriaMatrix(taskOf(p),{acceptanceCriteria}).ok,false);
  assert.equal(canPromoteWave(promotion(p),{acceptanceCriteria}).ok,false);
 }
});

test('AC-006: 2.1 migration preserves existing gate maps and input',()=>{
 const p=fixture();p.schema_version='2.1';taskOf(p).phase='VALIDATE';taskOf(p).gates.tests='FAIL';taskOf(p).gate_origins.tests='TESTE';
 const original=structuredClone(p),m=migrateProgress(p);expectValid(m);
 assert.deepEqual(taskOf(m.value).gate_evidence,taskOf(p).gate_evidence);
 assert.deepEqual(taskOf(m.value).gate_origins,taskOf(p).gate_origins);
 assert.deepEqual(p,original);
});
test('AC-006: promoted proof survives persistence, validation and migration',()=>{
 const p=fixture();p.schema_version='2.3';p.waves[0]=promotion(p);p.waves[0].status='completed';
 const stored=JSON.parse(JSON.stringify(p));expectValid(validateProgress(stored));
 const resumed=migrateProgress(stored);expectValid(resumed);assert.deepEqual(resumed.value,stored);
});
test('AC-006: completed wave cannot resume with missing or invalid durable proof',()=>{
 const mutations=[w=>{delete w.review;},w=>{delete w.validation;},w=>{w.review.independent=false;},w=>{w.review.agent='existing-code';},w=>{w.review.aggregate.counts.P2=1;},w=>{w.validation.suite.output='';},w=>{w.validation.gates.tests.status='FAIL';},w=>{w.validation.agent='integrator';},w=>{w.integration.attempt=0;},w=>{w.validation.extra=true;}];
 for(const mutate of mutations) {
  const p=fixture();p.schema_version='2.3';p.waves[0]=promotion(p);p.waves[0].status='completed';mutate(p.waves[0]);
  assert.equal(validateProgress(p).ok,false);assert.equal(migrateProgress(p).ok,false);
 }
});
test('AC-006: legacy completion without proof reopens explicitly; valid proof is preserved',()=>{
 for(const version of ['2.1','2.2']) for(const missing of ['review','validation','both']) {
  const p=fixture();p.schema_version=version;p.waves[0]=promotion(p);p.waves[0].status='completed';
  if(missing!=='validation') delete p.waves[0].review;
  if(missing!=='review') delete p.waves[0].validation;
  const old=structuredClone(p),m=migrateProgress(p);expectValid(m);
  assert.equal(m.value.schema_version,'2.3');assert.equal(m.value.waves[0].status,'integrating');
  assert.deepEqual(m.value.waves[0].integration,p.waves[0].integration);
  assert.deepEqual(m.value.waves[0].review,p.waves[0].review);assert.deepEqual(m.value.waves[0].validation,p.waves[0].validation);
  assert.deepEqual(p,old);assert.equal(canPromoteWave(m.value.waves[0]).ok,false);
 }
 const p=fixture();p.schema_version='2.2';p.waves[0]=promotion(p);p.waves[0].status='completed';
 const m=migrateProgress(p);expectValid(m);assert.equal(m.value.waves[0].status,'completed');assert.deepEqual(m.value.waves[0],p.waves[0]);
});
test('AC-006: migration initializes only absent gate maps and rejects malformed maps',()=>{
 const p=fixture();p.schema_version='2.1';taskOf(p).phase='PENDING';
 taskOf(p).gates=Object.fromEntries(GATES.map(g=>[g,'pending']));
 delete taskOf(p).gate_origins;delete taskOf(p).gate_evidence;
 const m=migrateProgress(p);expectValid(m);
 for(const key of ['gate_origins','gate_evidence']) assert.deepEqual(taskOf(m.value)[key],Object.fromEntries(GATES.map(g=>[g,''])));
 for(const key of ['gate_origins','gate_evidence']) for(const value of [null,[],{extra:'forbidden'}]) {
  const q=structuredClone(p);taskOf(q)[key]=value;assert.equal(migrateProgress(q).ok,false);
 }
});
test('AC-006: legacy invalid proofs are preserved and rejected, never upgraded to approval',()=>{
 for(const version of ['2.1','2.2']) {
  const p=fixture();p.schema_version=version;p.waves[0]=promotion(p);p.waves[0].status='completed';p.waves[0].review.independent=false;
  const original=structuredClone(p);assert.equal(migrateProgress(p).ok,false);assert.deepEqual(p,original);
 }
 const p=fixture();p.schema_version='2.2';assert.equal(validateProgress(p).ok,false);expectValid(migrateProgress(p));
 p.schema_version='2.4';assert.equal(migrateProgress(p).ok,false);
});
test('AC-006: durable normative completion uses global metadata and rejects extra wave fields',()=>{
 const p=fixture('AC-016','normative');p.waves[0]=promotion(p);p.waves[0].status='completed';
 expectValid(validateProgress(p));expectValid(migrateProgress(p));
 p.waves[0].extra='forbidden';assert.equal(validateProgress(p).ok,false);
});
test('AC-006: task normalization cannot hide missing current completion proof',()=>{
 const p=fixture();p.waves[0]=promotion(p);p.waves[0].status='completed';delete p.waves[0].review;
 taskOf(p).review.status='PENDING';taskOf(p).review.independent=false;
 assert.equal(migrateProgress(p).ok,false);
});
test('AC-006: promotion checks current criterion status and links when metadata is supplied',()=>{
 const p=fixture(),w=promotion(p);
 expectValid(canPromoteWave(w,{acceptanceCriteria:p.acceptance_criteria}));
 const cases=[
  [],
  [metadata('AC-002','behavioral')],
  [{...metadata('AC-001'),status:'COVERED'}],
  [{...metadata('AC-001'),tasks:['another-task']}],
  [{...metadata('AC-001'),tasks:null}],
  [...p.acceptance_criteria,{...metadata('AC-002'),tasks:['T001']}],
 ];
 for(const acceptanceCriteria of cases) assert.equal(canPromoteWave(w,{acceptanceCriteria}).ok,false,JSON.stringify(acceptanceCriteria));
 // Global criteria belonging to other waves do not block this wave.
 expectValid(canPromoteWave(w,{acceptanceCriteria:[...p.acceptance_criteria,{...metadata('AC-002'),tasks:['T002'],status:'PENDING'}]}));
 // Legacy callers remain compatible; persisted progress always supplies metadata.
 expectValid(canPromoteWave(w));
});

test('AC-003 — migração 2.1 preserva espaços significativos no título sem trim oportunista',()=>{
 const legacy=fixture();
 legacy.schema_version='2.1';
 const task=taskOf(legacy);
 task.phase='PENDING';
 task.attempt=2;
 task.blockers=['attempt history diagnosis'];
 task.evidence='attempt history evidence';
 legacy.waves[0].integration={status:'FAIL',attempt:2,evidence:'integration history proof'};
 task.gates.tests='FAIL';
 task.gate_origins.tests='TESTE';
 task.gate_evidence.tests='fixture tests; output: FAIL';
 const title='scripts/state-evolution.test.mjs::title  with spaces : literal   ';
 task.red.criteria_to_tests=`AC-001 -> ${title}`;
 const before=structuredClone(legacy);
 const migrated=migrateProgress(legacy);
 expectValid(migrated);
 const migratedTask=taskOf(migrated.value);
 assert.deepEqual(migratedTask.red.criteria_to_tests,{ 'AC-001':[title] });
 assert.equal(migratedTask.attempt,2);
 assert.deepEqual(migratedTask.blockers,['attempt history diagnosis']);
 assert.equal(migratedTask.evidence,'attempt history evidence');
 assert.deepEqual(migrated.value.waves[0].integration,legacy.waves[0].integration);
 assert.equal(migratedTask.gates.tests,'FAIL');
 assert.equal(migratedTask.gate_origins.tests,'TESTE');
 assert.equal(migratedTask.gate_evidence.tests,'fixture tests; output: FAIL');
 assert.deepEqual(legacy,before);

 const malformed=structuredClone(legacy);
 malformed.waves[0].tasks[0].red.criteria_to_tests=` AC-001 -> ${title}`;
 const malformedResult=migrateProgress(malformed);
 assert.equal(malformedResult.ok,false);
 assert.match(malformedResult.errors.join(' '),/matrix|invalid|AC-001/i);
});

test('AC-003 — RED_REVISION com baseline fornecida inválida bloqueia sem substituir diagnóstico',()=>{
 const legacy=fixture();
 legacy.schema_version='2.1';
 const task=taskOf(legacy);
 task.phase='RED_REVISION';
 task.red.criteria_to_tests={'AC-001':['fixture.test.mjs::current matrix reference']};
 task.red.revision_baseline_tests={
  'AC-001':['not-a-test-reference'],
  'AC-999':['fixture.test.mjs::orphan baseline reference'],
 };
 task.attempt=2;
 task.blockers=['baseline inválida fornecida'];
 task.evidence='diagnóstico original da baseline';
 legacy.waves[0].integration={status:'FAIL',attempt:2,evidence:'integration attempt history'};
 task.gates.tests='FAIL';
 task.gate_origins.tests='TESTE';
 task.gate_evidence.tests='fixture tests; output: FAIL';
 const before=structuredClone(legacy);
 const migrated=migrateProgress(legacy);
 assert.equal(migrated.ok,false);
 assert.equal(migrated.value,undefined);
 const diagnostics=migrated.errors.join(' ');
 assert.match(diagnostics,/baseline|invalid|reference|AC-999/i);
 assert.match(diagnostics,/baseline inválida fornecida/);
 assert.match(diagnostics,/diagnóstico original da baseline/);
 assert.deepEqual(legacy,before);
});

test('AC-003 — RED_REVISION sem baseline fornecida mantém compatibilidade e preserva tentativa, histórico e gates',()=>{
 const legacy=fixture();
 legacy.schema_version='2.1';
 const task=taskOf(legacy);
 task.phase='RED_REVISION';
 const currentMatrix={'AC-001':['fixture.test.mjs::current compatibility reference']};
 task.red.criteria_to_tests=currentMatrix;
 delete task.red.revision_baseline_tests;
 task.attempt=1;
 task.blockers=['previous retry diagnosis'];
 task.evidence='previous retry evidence';
 legacy.waves[0].integration={status:'FAIL',attempt:1,evidence:'integration retry history'};
 task.gates.tests='FAIL';
 task.gate_origins.tests='TESTE';
 task.gate_evidence.tests='fixture tests; output: FAIL';
 const before=structuredClone(legacy);
 const migrated=migrateProgress(legacy);
 expectValid(migrated);
 const migratedTask=taskOf(migrated.value);
 assert.deepEqual(migratedTask.red.revision_baseline_tests,currentMatrix);
 assert.deepEqual(migratedTask.red.criteria_to_tests,currentMatrix);
 assert.equal(migratedTask.red.status,'PENDING');
 assert.deepEqual(migratedTask.red.failing_tests,[]);
 assert.deepEqual(migratedTask.red.revision_delta,{ac:'',test:'',evidence:''});
 assert.equal(migratedTask.attempt,1);
 assert.deepEqual(migratedTask.blockers,['previous retry diagnosis']);
 assert.equal(migratedTask.evidence,'previous retry evidence');
 assert.deepEqual(migrated.value.waves[0].integration,legacy.waves[0].integration);
 assert.equal(migratedTask.gates.tests,'FAIL');
 assert.equal(migratedTask.gate_origins.tests,'TESTE');
 assert.equal(migratedTask.gate_evidence.tests,'fixture tests; output: FAIL');
 assert.deepEqual(legacy,before);
});
test('AC-003 schema 2.3 valid RED_REVISION roundtrip preserves current proof exactly',()=>{
 const input=current23RedRevisionFixture();
 const before=structuredClone(input);
 const validation=validateProgress(input);
 assert.equal(validation.ok,true,JSON.stringify(validation.errors));
 const migrated=migrateProgress(input);
 expectValid(migrated);
 assert.deepEqual(migrated.value,before);
 const migratedTask=taskOf(migrated.value);
 const beforeTask=taskOf(before);
 assert.deepEqual(migratedTask.red,beforeTask.red);
 assert.deepEqual(migratedTask.gates,beforeTask.gates);
 assert.deepEqual(migratedTask.gate_origins,beforeTask.gate_origins);
 assert.deepEqual(migratedTask.gate_evidence,beforeTask.gate_evidence);
 assert.deepEqual(migratedTask.blockers,beforeTask.blockers);
 assert.equal(migratedTask.attempt,beforeTask.attempt);
 assert.deepEqual(migratedTask.review,beforeTask.review);
 assert.deepEqual(migrated.value.waves[0].integration,before.waves[0].integration);
});

test('AC-003 schema 2.3 invalid baseline and gates reject without silent repair',()=>{
 const cases=[
  ['revision baseline',progress=>{taskOf(progress).red.revision_baseline_tests={'AC-001':['invalid baseline reference']};}],
  ['gate status',progress=>{taskOf(progress).gates.tests='INVALID';}],
 ];
 for(const [label,mutate] of cases) {
  const input=current23RedRevisionFixture();
  mutate(input);
  const before=structuredClone(input);
  assert.equal(validateProgress(input).ok,false,`${label} control must be invalid`);
  const migrated=migrateProgress(input);
  assert.equal(migrated.ok,false,`${label} current schema must remain invalid`);
  assert.deepEqual(input,before,`${label} input must remain unchanged`);
  assert.ok(Array.isArray(migrated.errors)&&migrated.errors.length>0,`${label} must expose diagnostics`);
  assert.ok(migrated.errors.some(error=>error.includes('schema 2.3 current diagnostic')),`${label} diagnostic must be retained`);
 }
});

test('AC-003 schema 2.2 distinguishes supplied invalid baseline from absent baseline',()=>{
 const invalid=current23RedRevisionFixture();
 invalid.schema_version='2.2';
 taskOf(invalid).red.revision_baseline_tests={'AC-001':['invalid 2.2 baseline reference']};
 taskOf(invalid).blockers=['2.2 supplied baseline diagnostic'];
 const invalidBefore=structuredClone(invalid);
 const rejected=migrateProgress(invalid);
 assert.equal(rejected.ok,false);
 assert.deepEqual(invalid,invalidBefore);
 assert.ok(rejected.errors.some(error=>error.includes('2.2 supplied baseline diagnostic')));

 const absent=current23RedRevisionFixture();
 absent.schema_version='2.2';
 delete taskOf(absent).red.revision_baseline_tests;
 const matrix=structuredClone(taskOf(absent).red.criteria_to_tests);
 const absentBefore=structuredClone(absent);
 const migrated=migrateProgress(absent);
 expectValid(migrated);
 const migratedTask=taskOf(migrated.value);
 assert.deepEqual(migratedTask.red.revision_baseline_tests,matrix);
 assert.deepEqual(migratedTask.red.criteria_to_tests,matrix);
 assert.equal(migratedTask.red.status,'PENDING');
 assert.deepEqual(migratedTask.red.failing_tests,[]);
 assert.deepEqual(migratedTask.red.revision_delta,{ac:'',test:'',evidence:''});
 assert.deepEqual(absent,absentBefore);
});

// Preserve actual Vitest titles verbatim: ':' is ordinary title punctuation.
// These are synthetic progress records, not claims that product gates ran.
const titledRef='scripts/state-evolution.test.mjs::AC-006: normative revision migration retains the original document proof';
test('AC-006: criteria matrix accepts an unchanged test title containing a colon',()=>{
 const p=fixture();taskOf(p).red.criteria_to_tests['AC-001']=[titledRef];
 expectValid(validateCriteriaMatrix(taskOf(p),{acceptanceCriteria:p.acceptance_criteria}));
 expectValid(validateProgress(p));
});
test('AC-006: behavioral RED proof and persisted promotion retain colon titles verbatim',()=>{
 const p=fixture(),t=taskOf(p);t.implemented_by='backend-developer';
 t.green={...t.green,status:'PASS',reason_if_skipped:'',changed_files:['src/a.mjs']};
 t.refactor={status:'PASS',reason_if_skipped:''};
 t.red.criteria_to_tests['AC-001']=[titledRef];t.red.failing_tests=[titledRef];t.red.failure_reason_expected=true;
 expectValid(validateProgress(p));
 p.waves[0]=promotion(p);
 expectValid(canPromoteWave(p.waves[0],{acceptanceCriteria:p.acceptance_criteria}));
 p.waves[0].status='completed';
 const stored=JSON.parse(JSON.stringify(p));expectValid(validateProgress(stored));
 const migrated=migrateProgress(stored);expectValid(migrated);
 assert.deepEqual(migrated.value,stored);assert.equal(taskOf(migrated.value).red.failing_tests[0],titledRef);
});
test('AC-006: legacy migration preserves colon titles and revision baseline without rewriting evidence',()=>{
 for(const version of ['2.1','2.2']) {
  const p=fixture(),t=taskOf(p);p.schema_version=version;t.phase='RED_REVISION';
  t.red.criteria_to_tests['AC-001']=[titledRef];
  t.red.revision_baseline_tests={'AC-001':[titledRef]};
  const before=structuredClone(p),m=migrateProgress(p);expectValid(m);
  assert.deepEqual(p,before);assert.deepEqual(taskOf(m.value).red.criteria_to_tests,t.red.criteria_to_tests);
  assert.deepEqual(taskOf(m.value).red.revision_baseline_tests,{'AC-001':[titledRef]});
  assert.deepEqual(m.value.waves[0].integration,p.waves[0].integration);
  assert.deepEqual(taskOf(m.value).gate_evidence,t.gate_evidence);
 }
});
test('AC-006: test references still require a single separator and nonempty single-line parts',()=>{
 for(const reference of ['::title','file::','file::title::ambiguous','file::title\nsecond','file\nname::title','file::title\rsecond']) {
  const p=fixture();taskOf(p).red.criteria_to_tests['AC-001']=[reference];
  assert.equal(validateCriteriaMatrix(taskOf(p)).ok,false,JSON.stringify(reference));
 }
});
