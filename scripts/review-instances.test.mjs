import { describe, it, expect } from 'vitest';
import * as protocol from '../deep-review/lib/protocol.mjs';
const aggregate=(...args)=>typeof protocol.aggregateReviewInstances==='function'?protocol.aggregateReviewInstances(...args):{ok:false,errors:['instance API missing']};
const assignment=(id='ReviewOne',agent='deep-reviewer',files=['src/one.mjs'])=>({id,agent,files});
const native=(agent='deep-reviewer',findings=[])=>({agent,protocol_mode:agent==='deep-reviewer'?'DEEP_REVIEW':'DEEP_REVIEW_FALLBACK',status:'VALID',reviewed_revision:'fixture-revision',overall_correctness:'correct',explanation:'Synthetic fixture only',confidence:1,findings});
const finding=(priority=2,file_path='src/one.mjs')=>({title:'Synthetic issue',body:'Synthetic reproducible issue',priority,confidence:1,file_path,line_start:1,line_end:2});
const valid=(r)=>expect(r).toMatchObject({ok:true,errors:[]});
describe('AC-006: native OMP reviewer instance aggregation',()=>{
 it('aggregates multiple instances of the same named agent type without changing native envelopes',()=>{
  const assignments=[assignment(),assignment('ReviewTwo','deep-reviewer',['src/two.mjs'])];
  const results=assignments.map(a=>({id:a.id,result:native(a.agent)})),before=structuredClone({assignments,results});
  const r=aggregate(results,'fixture-revision',assignments);valid(r);
  expect(r.value.reviewers).toEqual(['ReviewOne','ReviewTwo']);expect(r.value.counts).toEqual({P0:0,P1:0,P2:0,P3:0});
  expect({assignments,results}).toEqual(before);
 });
 it('normalizes optional native findings and accepts fallback instances in their own round',()=>{
  const result=native();delete result.findings;valid(aggregate([{id:'ReviewOne',result}],'fixture-revision',[assignment()]));
  valid(aggregate([{id:'Fallback',result:native('peer-reviewer')}],'fixture-revision',[assignment('Fallback','peer-reviewer')]));
 });
 it('matches IDs case-insensitively and rejects missing, unknown, duplicate or mixed instances',()=>{
  valid(aggregate([{id:'reviewone',result:native()}],'fixture-revision',[assignment()]));
  for(const [results,assignments] of [
   [[],[assignment()]],
   [[{id:'Other',result:native()}],[assignment()]],
   [[{id:'ReviewOne',result:native()},{id:'reviewone',result:native()}],[assignment()]],
   [[{id:'ReviewOne',result:native()}],[assignment(),assignment('reviewone')]],
   [[{id:'ReviewOne',result:native()},{id:'Fallback',result:native('peer-reviewer')}],[assignment(),assignment('Fallback','peer-reviewer',['src/two.mjs'])]],
  ]) expect(aggregate(results,'fixture-revision',assignments).ok).toBe(false);
 });
 it('preserves P2/P3 findings and blocks P0/P1 without losing findings',()=>{
  for(const priority of [0,1,2,3]) {
   const r=aggregate([{id:'ReviewOne',result:native('deep-reviewer',[finding(priority)])}],'fixture-revision',[assignment()]);valid(r);
   expect(r.value.status).toBe(priority<2?'BLOCKED':'APPROVED');expect(r.value.counts[`P${priority}`]).toBe(1);expect(r.value.findings).toEqual([finding(priority)]);
  }
 });
 it('rejects stale, spoofed, invalid and out-of-scope native findings',()=>{
  const mutations=[r=>{r.reviewed_revision='stale';},r=>{r.agent='ReviewOne';},r=>{r.protocol_mode='DEEP_REVIEW_FALLBACK';},r=>{r.confidence=2;},r=>{r.findings=null;},r=>{r.findings=[finding(2,'src/two.mjs')];},r=>{r.extra=true;}];
  for(const mutate of mutations) {const r=native();mutate(r);expect(aggregate([{id:'ReviewOne',result:r}],'fixture-revision',[assignment()]).ok).toBe(false);}
  expect(aggregate([{id:'ReviewOne',result:{ok:true,errors:['bad'],value:native()}}],'fixture-revision',[assignment()]).ok).toBe(false);
 });
 it('requires canonical non-overlapping assignment paths and rejects invalid envelopes',()=>{
  for(const path of ['../a','./a','/abs','C:/abs','a\\b','a//b','a/../b','a\u0000b','https://site/file']) expect(aggregate([{id:'ReviewOne',result:native()}],'fixture-revision',[assignment('ReviewOne','deep-reviewer',[path])]).ok).toBe(false);
  const good=[{id:'ReviewOne',result:native()}];
  for(const assignments of [null,[],[assignment('','deep-reviewer')],[assignment('ReviewOne','unknown')],[assignment('ReviewOne','deep-reviewer',[])],[{...assignment(),extra:true}],[assignment(),assignment('ReviewTwo','deep-reviewer',['SRC/ONE.MJS'])]]) expect(aggregate(good,'fixture-revision',assignments).ok).toBe(false);
  for(const results of [null,[{id:'ReviewOne',result:native(),extra:true}],[{result:native()}]]) expect(aggregate(results,'fixture-revision',[assignment()]).ok).toBe(false);
  valid(aggregate([{id:'ReviewOne',result:native('deep-reviewer',[finding(2,'src/with space.mjs')])}],'fixture-revision',[assignment('ReviewOne','deep-reviewer',['src/with space.mjs'])]));
 });
});
