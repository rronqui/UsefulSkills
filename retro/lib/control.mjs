// Read-only retrospective control. Commands in descriptions are never evaluated.
import {createHash} from 'node:crypto';
import {readQualityFile, validateQuality} from '../../tdd-orchestrator/lib/quality.mjs';

const HASH = /^[a-f0-9]{64}$/;
const FLAGS = ['requested','opt_out','first_pilot','significant_failure','significant_rework','user_unblock'];
const TRIGGERS = ['full', ...FLAGS.filter(k => k !== 'opt_out')];
const INPUT = ['run_id','delivery_report','route','reason','evidence','expectedContextDigest',...FLAGS];
const DECISION = ['schema_version','run_id','delivery_revision','delivery_report','context_digest','opt_out','delivery_status','decision_status','required','triggers','reason','evidence','errors'];
const REPORT = ['run_id','delivery_revision','status','sources','findings','proposals','limitations','next_action'];
const text = v => typeof v === 'string' && v.trim().length > 0;
const id = v => text(v) && v === v.trim() && !/[\x00-\x1f\x7f]/.test(v);
const hash = v => typeof v === 'string' && HASH.test(v);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const message = e => e instanceof Error ? e.message : 'Invalid retrospective data';
const requireValue = (condition, label) => { if (!condition) throw Error(label); };

// Reject active properties, non-JSON values, decorated arrays and cyclic inputs
// before inspecting caller data. No normalization changes their meaning.
function json(value, ancestors = new Set()) {
  if (value === null || ['string','boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  requireValue(value && typeof value === 'object' && !ancestors.has(value), 'Acyclic JSON data required');
  requireValue(Array.isArray(value) ? Object.getPrototypeOf(value) === Array.prototype : [Object.prototype,null].includes(Object.getPrototypeOf(value)), 'Plain JSON objects and arrays required');
  requireValue(!Object.getOwnPropertySymbols(value).length, 'Symbol properties refused');
  requireValue(Object.getOwnPropertyNames(value).length === Object.keys(value).length + (Array.isArray(value) ? 1 : 0), 'Hidden properties refused');
  if (Array.isArray(value)) requireValue(Object.keys(value).length === value.length, 'Dense undecorated arrays required');
  ancestors.add(value);
  try {
    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value,key);
      requireValue(Object.hasOwn(descriptor,'value'), 'Accessor properties refused');
      json(descriptor.value,ancestors);
    }
  } finally { ancestors.delete(value); }
}
function closed(value, keys, optional = []) {
  requireValue(value !== null && typeof value === 'object' && !Array.isArray(value), 'Object required');
  requireValue(Object.keys(value).every(k => keys.includes(k) || optional.includes(k)) && keys.every(k => Object.hasOwn(value,k)), 'Missing or unknown object fields');
}
function relative(file) {
  return text(file) && !file.includes('\\') && !/[:\x00-\x1f\x7f]/.test(file) &&
    file.split('/').every(p => p && p !== '.' && p !== '..' && p === p.trim() && !p.endsWith('.') && p.toLowerCase() !== '.git');
}
function proofs(root, values, label) {
  requireValue(Array.isArray(values) && values.length > 0, `${label}: nonempty proofs required`);
  for (const proof of values) {
    closed(proof,['path','sha256']);
    requireValue(relative(proof.path) && hash(proof.sha256), `${label}: canonical path and lowercase SHA256 required`);
    requireValue(sha(readQualityFile(root,proof.path)) === proof.sha256, `${label}: proof hash mismatch`);
  }
}
function delivery(root, file, runId, expected) {
  requireValue(relative(file) && id(runId) && hash(expected), 'Delivery path, run and independent context digest required');
  const bytes = readQualityFile(root,file);
  const report = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));
  const result = validateQuality(root,report,{stage:'delivery',expectedContextDigest:expected});
  requireValue(result.ok, `Delivery validation failed: ${result.errors.join('; ')}`);
  requireValue(report.context?.run_id === runId && hash(report.revision), 'Delivery run or revision mismatch');
  requireValue(bytes.equals(readQualityFile(root,file)), 'Delivery changed during validation');
  return report.revision;
}

/** Revalidate the delivery and decide whether retrospective analysis is required. */
export function triageRetro(root,input) {
  const decision = {schema_version:1,run_id:null,delivery_revision:null,delivery_report:null,
    context_digest:null,opt_out:null,delivery_status:'UNKNOWN',decision_status:'INCOMPLETE',
    required:null,triggers:[],reason:'Retrospective triage is incomplete.',evidence:[],errors:[]};
  try {
    // Preserve only safe diagnostic values even when another required field fails.
    if (input && typeof input === 'object' && !Array.isArray(input)) {
      const own = key => Object.getOwnPropertyDescriptor(input,key)?.value;
      if (id(own('run_id'))) decision.run_id = own('run_id');
      if (relative(own('delivery_report'))) decision.delivery_report = own('delivery_report');
      if (typeof own('opt_out') === 'boolean') decision.opt_out = own('opt_out');
    }
    json(input);
    closed(input,INPUT);
    requireValue(FLAGS.every(k => typeof input[k] === 'boolean'), 'All retrospective flags must be explicit booleans');
    requireValue(id(input.run_id) && relative(input.delivery_report), 'Valid run_id and delivery_report required');
    requireValue(['full','short'].includes(input.route) && text(input.reason), 'Valid route and descriptive reason required');
    requireValue(hash(input.expectedContextDigest), 'Independent expectedContextDigest required');
    proofs(root,input.evidence,'Decision evidence');
    const revision = delivery(root,input.delivery_report,input.run_id,input.expectedContextDigest);
    decision.delivery_revision = revision;
    decision.context_digest = input.expectedContextDigest;
    decision.triggers = TRIGGERS.filter(k => k === 'full' ? input.route === 'full' : input[k]);
    decision.reason = input.reason;
    decision.evidence = input.evidence.map(p => ({...p}));
    decision.delivery_status = 'PASS';
    decision.decision_status = 'COMPLETE';
    decision.required = !input.opt_out && decision.triggers.length > 0;
  } catch (error) { decision.errors.push(message(error)); }
  return decision;
}

/** Validate an analysis against a complete required decision and current sources. */
export function validateRetro(root,decision,report,options) {
  try {
    for (const value of [decision,report,options]) json(value);
    closed(options,['expectedContextDigest']);
    requireValue(hash(options.expectedContextDigest), 'Independent expectedContextDigest required');
    closed(decision,DECISION);
    requireValue(decision.schema_version === 1 && decision.decision_status === 'COMPLETE' && decision.delivery_status === 'PASS' && decision.required === true && decision.opt_out === false, 'Complete required decision with delivery PASS required');
    requireValue(id(decision.run_id) && hash(decision.delivery_revision) && hash(decision.context_digest) && relative(decision.delivery_report) && text(decision.reason), 'Invalid decision identity or reason');
    requireValue(Array.isArray(decision.errors) && decision.errors.length === 0, 'Complete decision cannot contain errors');
    requireValue(Array.isArray(decision.triggers) && decision.triggers.length > 0 && decision.triggers.every((k,i,a) => TRIGGERS.includes(k) && (i === 0 || TRIGGERS.indexOf(a[i-1]) < TRIGGERS.indexOf(k))), 'Triggers must be unique and in canonical order');
    requireValue(decision.context_digest === options.expectedContextDigest, 'Decision context mismatch');
    const revision = delivery(root,decision.delivery_report,decision.run_id,options.expectedContextDigest);
    requireValue(revision === decision.delivery_revision, 'Decision revision mismatch');
    proofs(root,decision.evidence,'Decision evidence');
    closed(report,REPORT);
    requireValue(report.status === 'COMPLETE' && report.run_id === decision.run_id && report.delivery_revision === revision, 'Complete analysis for current run and revision required');
    proofs(root,report.sources,'Report sources');
    requireValue(Array.isArray(report.findings), 'Findings array required');
    for (const finding of report.findings) {
      closed(finding,['category','evidence','consequence','cause'],['recurrence']);
      requireValue(['product','environment','instruction','execution'].includes(finding.category) && text(finding.consequence) && text(finding.cause) && (!Object.hasOwn(finding,'recurrence') || text(finding.recurrence)), 'Invalid finding category or description');
      proofs(root,finding.evidence,'Finding evidence');
    }
    requireValue(Array.isArray(report.proposals) && report.proposals.length <= 3, 'At most three proposals allowed');
    const seen = new Set();
    for (const proposal of report.proposals) {
      closed(proposal,['id','evidence','action','priority','success_criterion']);
      requireValue(id(proposal.id) && !seen.has(proposal.id) && text(proposal.action) && text(proposal.success_criterion) && ['high','medium','low'].includes(proposal.priority), 'Invalid or duplicate proposal');
      seen.add(proposal.id);
      proofs(root,proposal.evidence,'Proposal evidence');
    }
    requireValue(Array.isArray(report.limitations) && report.limitations.every(text) && text(report.next_action), 'Descriptive limitations and next_action required');
    return {ok:true,errors:[]};
  } catch (error) { return {ok:false,errors:[message(error)]}; }
}
