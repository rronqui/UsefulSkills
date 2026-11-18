// Portable, read-only checks for the existing documentation/security gates.
// A report records human review; this module does not perform that review or run commands.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const OMIT = new Set(['.git', '.omp', 'node_modules']);
const HASH = /^[a-f0-9]{64}$/;
const text = v => typeof v === 'string' && v.trim().length > 0;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const hash = data => createHash('sha256').update(data).digest('hex');
const digest = files => hash(JSON.stringify(Object.fromEntries(Object.entries(files).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))));

function canonical(file) {
  if (!text(file) || file.includes('\\') || /[:\x00-\x1f\x7f]/.test(file) || path.posix.isAbsolute(file)) throw Error('invalid relative path');
  if (file.split('/').some(p => !p || p === '.' || p === '..' || p !== p.trim() || p.endsWith('.'))) throw Error('invalid path segment');
  if (file.split('/').some(p => p.toLowerCase() === '.git')) throw Error('Git internal path refused');
  return file;
}

// Only the named proof envelopes are omitted. Nested decisions remain JSON data.
function canonicalJSON(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw Error('context requires finite, acyclic JSON');
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error('context requires plain JSON objects');
  ancestors.add(value);
  try {
    if (Object.getOwnPropertySymbols(value).length) throw Error('context cannot contain symbol keys');
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) throw Error('context cannot contain sparse or decorated arrays');
      return Array.from(value, item => canonicalJSON(item, ancestors));
    }
    return Object.fromEntries(Object.keys(value).sort().map(key => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!('value' in descriptor)) throw Error('context cannot contain accessors');
      return [key, canonicalJSON(descriptor.value, ancestors)];
    }));
  } finally { ancestors.delete(value); }
}

export function qualityContextDigest(report) {
  if (!object(report) || !object(report.baseline) || !object(report.security)) throw Error('complete quality context report required');
  const omit = value => {
    if (!object(value)) throw Error('context metadata must be an object');
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'evidence' && key !== 'context_digest'));
  };
  const review = report.review === undefined ? {} : report.review;
  return hash(JSON.stringify(canonicalJSON({
    schema_version: report.schema_version, baseline: { digest: report.baseline.digest }, revision: report.revision,
    context: report.context, changes: report.changes, documentation: report.documentation,
    security: { ...report.security, checks: report.security.checks?.map(omit), findings: report.security.findings?.map(omit) },
    review: omit(review),
  })));
}

function rootPath(root) {
  if (!text(root)) throw Error('project root required');
  const resolved = path.resolve(root);
  const stat = fs.lstatSync(resolved, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('root must be a real directory');
  if (fs.realpathSync(resolved).toLowerCase() !== resolved.toLowerCase()) throw Error('root has redirected ancestors');
  return resolved;
}

function inspectRegular(root, file) {
  canonical(file);
  let current = root;
  const identities = [fs.lstatSync(root, { bigint: true })];
  if (!identities[0].isDirectory() || identities[0].isSymbolicLink()) throw Error('root identity changed');
  const parts = file.split('/');
  for (const [i, part] of parts.entries()) {
    const aliases = fs.readdirSync(current).filter(name => name.toLowerCase() === part.toLowerCase());
    if (aliases.length !== 1 || aliases[0] !== part) throw Error(`colliding or noncanonical path: ${file}`);
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { bigint: true });
    identities.push(stat);
    if (stat.isSymbolicLink()) throw Error(`link refused: ${file}`);
    if (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile() || stat.nlink !== 1n) throw Error(`not a single regular file: ${file}`);
  }
  const real = fs.realpathSync(current);
  const rel = path.relative(root, real);
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) throw Error(`outside project: ${file}`);
  return { absolute: current, identities };
}

function regular(root, file) { return inspectRegular(root, file).absolute; }

const sameIdentity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.nlink === b.nlink;

// A pathname check alone is not permission to read. Pin the file descriptor,
// compare identity, and recheck every ancestor before reading any bytes.
// This is bounded Node filesystem validation, not an OS-wide sandbox claim.
export function readQualityFile(projectRoot, file) {
  const root = rootPath(projectRoot);
  const preflight = inspectRegular(root, file);
  const { absolute, identities } = preflight;
  const before = identities.at(-1);
  const recheck = () => {
    rootPath(root);
    const current = inspectRegular(root, file);
    if (current.identities.length !== identities.length || current.identities.some((stat, i) => !sameIdentity(identities[i], stat))) throw Error(`path identity changed: ${file}`);
  };
  let fd;
  try {
    fd = fs.openSync(absolute, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    const opened = fs.fstatSync(fd, { bigint: true });
    if (!opened.isFile() || opened.nlink !== 1n || !sameIdentity(before, opened)) throw Error(`file identity changed before read: ${file}`);
    recheck();
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd, { bigint: true });
    recheck();
    if (!sameIdentity(opened, after) || opened.size !== after.size || opened.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs) throw Error(`file changed during read: ${file}`);
    return bytes;
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

const parseQualityJSON = bytes => JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));

export function readQualityJSON(root, file) {
  return parseQualityJSON(readQualityFile(root, file));
}

export function readQualityContext(root, file, report, reportPath) {
  return contextFromJSON(file, report, reportPath, readQualityJSON(root, file));
}

function contextFromJSON(file, report, reportPath, value) {
  canonical(file);
  const forbidden = [reportPath, report.review?.evidence?.path, ...(report.security?.checks ?? []).map(check => check.evidence?.path)];
  if (forbidden.some(p => typeof p === 'string' && p.toLowerCase() === file.toLowerCase())) throw Error('independent quality context must not be report or receipt');
  if (!object(value) || value.schema_version !== 1 || typeof value.context_digest !== 'string' || !HASH.test(value.context_digest) || Object.keys(value).some(key => !['schema_version', 'context_digest'].includes(key))) throw Error('invalid independent quality context');
  return value.context_digest;
}

function recordProof(proofs, file, bytes) {
  const sha256 = hash(bytes);
  if (proofs.has(file) && proofs.get(file) !== sha256) throw Error(`proof changed during validation: ${file}`);
  proofs.set(file, sha256);
}

function proofReference(value) {
  return object(value) && typeof value.path === 'string' && typeof value.sha256 === 'string' && HASH.test(value.sha256);
}

function artifactRole(value) {
  if (!object(value)) return null;
  if (value.schema_version === 1 && object(value.baseline) && object(value.context) && object(value.security) && object(value.review)) return 'quality report';
  if (value.schema_version === 1 && typeof value.context_digest === 'string' && Object.keys(value).every(key => ['schema_version', 'context_digest'].includes(key))) return 'quality context';
  const controlReceipt = proofReference(value.source) &&
    HASH.test(value.revision) && HASH.test(value.context_digest);
  return controlReceipt ? 'receipt' : null;
}

function proofArtifactPaths(report, extra = []) {
  return new Set([
    ...extra,
    report.review?.evidence?.path,
    ...(report.security?.checks ?? []).map(check => check?.evidence?.path),
  ].filter(text).map(file => file.toLowerCase()));
}

// Internal consumer seam: fingerprint the exact bytes used by this validation,
// not a separately reread/reconstructed graph. This is distinct from context.
export function validateQualityReportFile(root, reportPath, contextPath, stage = 'delivery') {
  const proofs = new Map();
  const reportBytes = readQualityFile(root, reportPath);
  recordProof(proofs, reportPath, reportBytes);
  const report = parseQualityJSON(reportBytes);
  const contextBytes = readQualityFile(root, contextPath);
  recordProof(proofs, contextPath, contextBytes);
  const expectedContextDigest = contextFromJSON(contextPath, report, reportPath, parseQualityJSON(contextBytes));
  const validation = validateQualityInternal(root, report, {
    stage,
    expectedContextDigest,
    forbiddenPaths: [reportPath, contextPath],
  }, proofs);
  // The report must remain the exact artifact that was consumed through the
  // validation decision, not merely the object parsed before context loading.
  recordProof(proofs, reportPath, readQualityFile(root, reportPath));
  return { ...validation, report: validation.ok ? report : null, proofDigest: validation.ok ? digest(Object.fromEntries(proofs)) : null };
}

// Bounded README navigation adapted from OpenBot-Skill-Workflow/quality-control.mjs.
// Source SHA256: a2b580b0ec08e49341f8659c192dbaffaf3fc3ba5041ae50e6e9936ab46d2e71; only Markdown extraction is reused.
// Files remain subject to this module's pinned-FD confinement, never the source engine.
const markdownEscape=(text,i)=>{const c=text.charCodeAt(i+1);return text[i]==='\\'&&((c>=33&&c<=47)||(c>=58&&c<=64)||(c>=91&&c<=96)||(c>=123&&c<=126));};
const fenceStart=line=>{const m=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);return m&&(m[1][0]!=='`'||!m[2].includes('`'))?m:null;};
const quoteContent=line=>line.match(/^ {0,3}> ?(.*)$/)?.[1];
const thematic=line=>/^ {0,3}(?:(?:\* *){3,}|(?:- *){3,}|(?:_ *){3,})$/.test(line);
function listMarker(line){const m=line.match(/^( {0,3})([*+-]|\d{1,9}[.)])(?:( +)(.*)|$)/);if(!m)return null;const spaces=m[3]?.length??1;const padding=spaces>4?1:spaces;return {indent:m[1].length+m[2].length+padding,content:line.slice(m[1].length+m[2].length+padding),interrupt:(!/^\d/.test(m[2])||/^1[.)]$/.test(m[2]))&&!!m[4]};}
const htmlBlockNames=new Set('address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul'.split(' '));
function htmlBlock(line,paragraph){
 const s=line.replace(/^ {0,3}/,'');if(/^<(pre|script|style|textarea)(?:[ \t>]|$)/i.test(s))return {end:/<\/(?:pre|script|style|textarea)>/i};
 for(const [start,end]of [['<!--',/-->/],['<?',/\?>/],['<![CDATA[',/\]\]>/]])if(s.startsWith(start))return {end};
 if(/^<![A-Za-z]/.test(s))return {end:/>/};
 const tag=s.match(/^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[ \t>]|\/>|$)/)?.[1]?.toLowerCase();if(htmlBlockNames.has(tag))return {blank:true};
 // Type 7 requires a complete tag alone on its line and cannot interrupt prose.
 const name='[A-Za-z][A-Za-z0-9-]*',attribute='[A-Za-z_:][A-Za-z0-9_.:-]*';
 const value="(?:[^\\s\"'=<>`]+|'[^']*'|\"[^\"]*\")";
 const fullTag=new RegExp(`^(?:<${name}(?:[ \\t]+${attribute}(?:[ \\t]*=[ \\t]*${value})?)*[ \\t]*/?>|</${name}[ \\t]*>)[ \\t]*$`);
 return !paragraph&&fullTag.test(s)?{blank:true}:null;
}
const heading=line=>/^ {0,3}#{1,6}(?: +|$)/.test(line);
function interruptsParagraph(line){return !!fenceStart(line)||quoteContent(line)!==undefined||heading(line)||thematic(line)||/^ {0,3}=+ *$/.test(line)||!!htmlBlock(line,true)||!!listMarker(line)?.interrupt;}
function markdownProseBlocks(text){
 // Block structure precedes inline recognition (CommonMark 0.31.2 §§4–6).
 // Eligible records are leaf paragraphs/headings; raw HTML records preserve literal
 // context across paragraph boundaries. Container
 // boundaries and literal blocks cannot accidentally pair inline delimiters.
 const lines=text.replace(/\r\n?/g,'\n').split('\n').map(line=>{let col=0;return line.replace(/\t|[^\t]/g,c=>{if(c==='\t'){const n=4-col%4;col+=n;return ' '.repeat(n);}col++;return c;});});
 let work=0;const budget=Math.max(8192,text.length*128);
 function parse(input,depth=0){
  if(depth>32)throw Error('README Markdown container nesting exceeds 32');
  const blocks=[];let paragraph=[],open=false;
  const flush=()=>{if(paragraph.length){blocks.push({text:paragraph.join('\n'),eligible:true});paragraph=[];}};
  for(let i=0;i<input.length;){const line=input[i];work+=line.length+1;if(work>budget)throw Error('README Markdown block parsing budget exceeded');
   if(!line.trim()){flush();open=false;i++;continue;}
   const fence=fenceStart(line);
   if(fence){flush();open=false;i++;while(i<input.length){const close=input[i++].match(/^ {0,3}(`{3,}|~{3,}) *$/);if(close&&close[1][0]===fence[1][0]&&close[1].length>=fence[1].length)break;}continue;}
   const html=htmlBlock(line,paragraph.length>0);
   if(html){flush();open=false;const first=i;do{const current=input[i++];if(html.end?.test(current))break;}while(i<input.length&&(!html.blank||input[i].trim()));blocks.push({text:input.slice(first,i).join('\n'),eligible:false});continue;}
   if(quoteContent(line)!==undefined){
    flush();open=false;const child=[];let j=i,preview;
    while(j<input.length){const content=quoteContent(input[j]);if(content!==undefined){child.push(content);if(preview?.open&&content.trim()&&!interruptsParagraph(content))preview.blocks[preview.blocks.length-1].text+='\n'+content.trimStart();else preview=undefined;j++;continue;}
     if(!input[j].trim()||interruptsParagraph(input[j]))break;
     preview??=parse(child,depth+1);
     if(!preview.open)break;preview.blocks[preview.blocks.length-1].text+='\n'+input[j].trimStart();child.push(input[j++]);
    }
    const result=preview??parse(child,depth+1);blocks.push(...result.blocks);open=result.open;i=j;continue;
   }
   const marker=listMarker(line);
   if(marker&&(!paragraph.length||marker.interrupt)&&!thematic(line)){
    flush();open=false;const child=[marker.content];let j=i+1,preview;
    while(j<input.length){const next=input[j];if(!next.trim()){child.push('');preview=undefined;j++;continue;}
     if(next.startsWith(' '.repeat(marker.indent))){const content=next.slice(marker.indent);child.push(content);if(preview?.open&&content.trim()&&!interruptsParagraph(content))preview.blocks[preview.blocks.length-1].text+='\n'+content.trimStart();else preview=undefined;j++;continue;}
     if(listMarker(next)||interruptsParagraph(next))break;
     preview??=parse(child,depth+1);
     if(!preview.open)break;preview.blocks[preview.blocks.length-1].text+='\n'+next.trimStart();child.push(next);j++;
    }
    const result=preview??parse(child,depth+1);blocks.push(...result.blocks);open=result.open;i=j;continue;
   }
   if(heading(line)){flush();blocks.push({text:line.replace(/^ {0,3}#{1,6}(?: +|$)/,''),eligible:true});open=false;i++;continue;}
   if(paragraph.length&&/^ {0,3}(?:=+|-+) *$/.test(line)){flush();open=false;i++;continue;}
   if(thematic(line)){flush();open=false;i++;continue;}
   if(!paragraph.length&&/^ {4}/.test(line)){open=false;i++;continue;}
   paragraph.push(line.trimStart());open=true;i++;
  }
  flush();return {blocks,open};
 }
 return parse(lines).blocks;
}
const inlineTokenLimit=8192;
const rawTextElements=new Set(['script','style','textarea','title','xmp','iframe','noembed','noframes','plaintext','noscript']);
const tokenLimitError=()=>{throw Error('README inline literal token exceeds 8192 characters');};
function inlineTagToken(text,start){
 const limit=Math.min(text.length,start+inlineTokenLimit);let i=start+1;
 const char=(at=i)=>{if(at>=limit&&at<text.length)tokenLimitError();return text[at];};
 const space=()=>{let lines=0;while(char()===' '||char()==='\t'||char()==='\n'){if(char()==='\n'&&++lines>1)return false;i++;}return true;};
 const nameStart=c=>c!==undefined&&/^[A-Za-z]$/.test(c),namePart=c=>c!==undefined&&/^[A-Za-z0-9-]$/.test(c);
 const closing=char()==='/';if(closing)i++;if(!nameStart(char()))return null;const begin=i;while(namePart(char()))i++;const tag=text.slice(begin,i).toLowerCase();
 const finish=()=>({end:i+1,tag,closing,rawTag:!closing&&rawTextElements.has(tag)?tag:null});
 if(closing){if(!space()||char()!=='>')return null;return finish();}
 while(i<limit){const before=i;if(!space())return null;if(char()==='>')return finish();if(char()==='/'&&char(i+1)==='>'){i++;return finish();}if(i===before)return null;
  if(char()===undefined||!/^[A-Za-z_:]$/.test(char()))return null;i++;while(char()!==undefined&&/^[A-Za-z0-9_.:-]$/.test(char()))i++;
  const attributeEnd=i;if(!space())return null;if(char()!=='='){i=attributeEnd;continue;}i++;if(!space())return null;
  const quote=char();if(quote==='"'||quote==="'"){i++;while(char()!==undefined&&char()!==quote)i++;if(char()!==quote)return null;i++;}
  else{const valueStart=i;while(char()!==undefined&&!/[ \t\n\r"'=<>`]/.test(char()))i++;if(i===valueStart)return null;}
 }
 if(i<text.length)tokenLimitError();return null;
}
function rawTextClose(text,start,tag){
 if(tag==='plaintext')return null;
 const pattern=new RegExp('</'+tag+'[ \\t\\r\\n]*>','ig');pattern.lastIndex=start;const found=pattern.exec(text);if(found?.[0].length>inlineTokenLimit)tokenLimitError();return found?found.index+found[0].length:null;
}
const uriAutolinkPattern=/^<[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\x00-\x20\x7f<>]*>/;
const emailAutolinkPattern=/^<[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*>/;
function emailPrefix(candidate){
 const body=candidate.slice(1),at=body.indexOf('@'),local=at<0?body:body.slice(0,at);if(!/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local))return false;if(at<0)return true;
 const labels=body.slice(at+1).split('.');return labels.every((label,i)=>i===labels.length-1?label===''||/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(label):/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}
function literalInlineToken(text,start){
 if(text[start]!=='<')return null;const candidate=text.slice(start,start+8192);
 const auto=candidate.match(uriAutolinkPattern)??candidate.match(emailAutolinkPattern);if(auto)return {end:start+auto[0].length,autolink:true};const prefix=candidate.match(/^<[A-Za-z][A-Za-z0-9+.-]{1,31}:/);if(candidate.length===inlineTokenLimit&&start+inlineTokenLimit<text.length&&((prefix&&/^[^\x00-\x20\x7f<>]*$/.test(candidate.slice(prefix[0].length)))||emailPrefix(candidate)))tokenLimitError();
 const tag=inlineTagToken(text,start);if(tag)return tag;
 if(candidate.startsWith('<!-->'))return {end:start+5};if(candidate.startsWith('<!--->'))return {end:start+6};
 for(const [prefix,suffix]of [['<!--','-->'],['<?','?>'],['<![CDATA[',']]>']])if(candidate.startsWith(prefix)){const end=candidate.indexOf(suffix,prefix.length);if(end<0&&candidate.length===inlineTokenLimit&&start+inlineTokenLimit<text.length)tokenLimitError();return end<0?null:{end:start+end+suffix.length};}
 if(/^<![A-Za-z]/.test(candidate)){const end=candidate.indexOf('>',3);if(end>=0)return {end:start+end+1};if(candidate.length===inlineTokenLimit&&start+inlineTokenLimit<text.length)tokenLimitError();}
 return null;
}
function inlineCodeEnds(text){
 const runs=new Map(),ends=new Map();for(const m of text.matchAll(/`+/g)){const previous=runs.get(m[0].length);if(previous!==undefined)ends.set(previous,m.index+m[0].length);runs.set(m[0].length,m.index);}return ends;
}
function inlineDestination(text,start,codeEnds,image=false){
 // Bounded scanner: nested labels/parentheses up to 32, candidate up to 8192
 // characters. Backslash punctuation escapes are decoded before URI decoding.
 const limit=Math.min(text.length,start+8192);let i=start+1,depth=1;
 const bounded=()=>{if(image&&limit<text.length)throw Error('README inline image exceeds parser limits');return null;};
 const nesting=()=>{if(image)throw Error('README inline image exceeds parser limits');return null;};
 for(;i<limit;i++){if(markdownEscape(text,i)){i++;continue;}const token=literalInlineToken(text,i);const end=token?.end??codeEnds.get(i);if(end){if(end>limit)return bounded();if(token?.autolink&&!image)return null;i=end-1;continue;}if(text[i]==='['&&++depth>32)return nesting();if(text[i]===']'&&--depth===0)break;}
 if(depth)return i>=limit?bounded():null;if(++i>=limit)return bounded();if(text[i]!=='(')return null;i++;while(i<limit&&/[ \t\r\n]/.test(text[i]))i++;
 let destination='',angled=text[i]==='<';if(angled)i++;depth=0;let closed=false;
 for(;i<limit;i++){const c=text[i];if(markdownEscape(text,i)){destination+=text[++i];continue;}if(angled){if(c==='>'){i++;closed=true;break;}if(c==='<'||c==='\n'||c==='\r')return null;}else{if(c==='('){if(++depth>32)return nesting();}else if(c===')'){if(!depth){closed=true;break;}depth--;}else if(/\s/.test(c)){if(depth)return null;closed=true;break;}else if(c==='<'||c==='>')return null;}destination+=c;}
 if(!closed||depth)return i>=limit?bounded():null;
 const beforeSpace=i;while(i<limit&&/\s/.test(text[i]))i++;
 if(i>=limit)return bounded();if(text[i]!==')'){if(i===beforeSpace)return null;const quote=text[i++],closing=quote==='('?')':quote;if(!['"',"'",'('].includes(quote))return null;let titleClosed=false;for(;i<limit;i++){if(markdownEscape(text,i)){i++;continue;}if(text[i]===closing){i++;titleClosed=true;break;}if(quote==='('&&text[i]==='(')return null;}if(!titleClosed)return i>=limit?bounded():null;while(i<limit&&/\s/.test(text[i]))i++;}
 if(i>=limit)return bounded();
 return text[i]===')'?{destination,end:i+1}:null;
}
function localMarkdownLinks(text,root,readme){
 const links=new Set();let hidden=null;for(const block of markdownProseBlocks(text)){text=block.text;const codeEnds=block.eligible?inlineCodeEnds(text):new Map();
 for(let i=0;i<text.length;i++){
  if(hidden){const close=rawTextClose(text,i,hidden);if(close===null)break;hidden=null;i=close-1;continue;}
  if(block.eligible&&markdownEscape(text,i)){i++;continue;}const token=literalInlineToken(text,i);if(token?.rawTag){hidden=token.rawTag;i=token.end-1;continue;}const end=token?.end??codeEnds.get(i);if(end){i=end-1;continue;}if(!block.eligible)continue;const image=text[i]==='!'&&text[i+1]==='[';if(text[i]!=='['&&!image)continue;const parsed=inlineDestination(text,image?i+1:i,codeEnds,image);if(!parsed)continue;i=parsed.end-1;if(image)continue;
  try{const raw=parsed.destination.split('#')[0];if(!raw||/%(?:2f|5c|00)/i.test(raw))continue;const dest=decodeURIComponent(raw);if(/[\\:\u0000-\u001f]/.test(dest)||path.isAbsolute(dest)||raw.split('/').some(p=>/%2e/i.test(p)&&['.','..'].includes(decodeURIComponent(p))))continue;
   const file=path.relative(root,path.resolve(root,readme,'..',dest)).split(path.sep).join('/');readQualityFile(root,file);links.add(file);
  }catch{/* Malformed/unsafe links cannot satisfy document coverage. */}
 }}
 return links;
}

export function captureInventory(projectRoot) {
  const root = rootPath(projectRoot);
  const entries = [];
  function walk(dir, prefix = '') {
    const names = new Set();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      if (OMIT.has(entry.name.toLowerCase())) continue;
      if (names.has(entry.name.toLowerCase())) throw Error(`colliding inventory path: ${entry.name}`);
      names.add(entry.name.toLowerCase());
      const relative = prefix + entry.name;
      canonical(relative);
      const absolute = path.join(dir, entry.name);
      const stat = fs.lstatSync(absolute, { bigint: true });
      if (stat.isSymbolicLink()) throw Error(`link refused: ${relative}`);
      if (stat.isDirectory()) walk(absolute, relative + '/');
      else entries.push([relative, hash(readQualityFile(root, relative))]);
    }
  }
  walk(root);
  const files = Object.fromEntries(entries);
  return { files, digest: digest(files) };
}

function snapshot(value, errors) {
  if (!object(value) || !object(value.files) || !HASH.test(value.digest)) { errors.push('baseline inventory required'); return false; }
  const names = new Set();
  for (const [file, sha] of Object.entries(value.files)) {
    try { canonical(file); } catch { errors.push(`invalid baseline path: ${file}`); }
    if (file.split('/').some(p => OMIT.has(p.toLowerCase()))) errors.push(`excluded baseline path: ${file}`);
    if (!HASH.test(sha)) errors.push(`invalid baseline hash: ${file}`);
    if (names.has(file.toLowerCase())) errors.push(`colliding baseline path: ${file}`);
    names.add(file.toLowerCase());
  }
  if (digest(value.files) !== value.digest) errors.push('baseline digest mismatch');
  return true;
}

export function validateQuality(projectRoot, report, { stage = 'delivery', expectedContextDigest } = {}) {
  return validateQualityInternal(projectRoot, report, { stage, expectedContextDigest }, new Map());
}

function validateQualityInternal(projectRoot, report, { stage, expectedContextDigest, forbiddenPaths = [] }, proofs) {
  const errors = [];
  try {
    const root = rootPath(projectRoot);
    if (!['planning', 'delivery'].includes(stage)) throw Error('unknown quality stage');
    if (!object(report) || report.schema_version !== 1) throw Error('quality schema_version must be 1');
    if (!snapshot(report.baseline, errors)) return { ok: false, errors };
    const current = captureInventory(root);
    const security = report.security;
    if (!object(security) || !['low', 'medium', 'high'].includes(security.risk) || !text(security.rationale)) errors.push('security risk and rationale required');
    const context = report.context;
    if (!object(context)) throw Error('quality context required');
    canonicalJSON(context);
    if (!text(context.run_id) || !text(context.purpose)) errors.push('context run_id and purpose required');
    if (!object(context.environment) || !Object.keys(context.environment).length) errors.push('context environment required');
    const criteria = new Set();
    if (!Array.isArray(context.criteria) || !context.criteria.length) errors.push('context criteria required');
    for (const criterion of Array.isArray(context.criteria) ? context.criteria : []) {
      if (!object(criterion) || !text(criterion.id) || !text(criterion.description) || !['behavioral', 'normative'].includes(criterion.type) || criteria.has(criterion.id)) errors.push('invalid or duplicate context criterion');
      criteria.add(criterion?.id);
    }
    const evidence = (value, label) => {
      try {
        if (!object(value) || typeof value.sha256 !== 'string' || !HASH.test(value.sha256)) throw Error('path and sha256 required');
        const bytes = readQualityFile(root, value.path);
        if (hash(bytes) !== value.sha256) throw Error('hash mismatch');
        recordProof(proofs, value.path, bytes);
        return bytes;
      } catch (error) { errors.push(`${label} evidence: ${error.message}`); }
    };
    if (!Array.isArray(context.instructions) || (!context.instructions.length && !text(context.instructions_rationale))) errors.push('context instructions or explicit absence rationale required');
    for (const instruction of Array.isArray(context.instructions) ? context.instructions : []) evidence(instruction, 'context instruction');
    if (stage === 'planning') {
      if (current.digest !== report.baseline.digest) errors.push('planning baseline is stale');
      for (const field of ['documentation', 'security', 'review']) if (!text(report.plan?.[field])) errors.push(`plan.${field} required`);
      if (expectedContextDigest !== undefined) {
        try {
          const contextDigest = qualityContextDigest(report);
          if (typeof expectedContextDigest !== 'string' || !HASH.test(expectedContextDigest)) errors.push('independent expected context digest required');
          else if (expectedContextDigest !== contextDigest) errors.push('independent expected context digest mismatch');
        } catch (error) { errors.push(error.message); }
      }
      return { ok: errors.length === 0, errors };
    }
    const contextDigest = qualityContextDigest(report);
    if (typeof expectedContextDigest !== 'string' || !HASH.test(expectedContextDigest)) errors.push('independent expected context digest required');
    else if (expectedContextDigest !== contextDigest) errors.push('independent expected context digest mismatch');
    if (report.revision !== current.digest) errors.push('stale report revision');
    const artifacts = proofArtifactPaths(report, forbiddenPaths);
    const proofSource = (sourceRef, label, ownerPath) => {
      let reference = sourceRef;
      const visited = new Set([ownerPath.toLowerCase()]);
      while (true) {
        if (!object(reference) || typeof reference.path !== 'string') throw Error('receipt source path required');
        canonical(reference.path);
        const key = reference.path.toLowerCase();
        if (artifacts.has(key)) throw Error('receipt source must be an original proof, not a quality artifact');
        if (visited.has(key)) throw Error('receipt source cycle');
        visited.add(key);
        const sourceBytes = evidence(reference, `${label} source`);
        if (!sourceBytes) return;
        let source;
        try { source = parseQualityJSON(sourceBytes); } catch { return; }
        const role = artifactRole(source);
        if (role) throw Error(`receipt source must not be a ${role} artifact`);
        if (!Object.prototype.hasOwnProperty.call(source, 'source')) return;
        // A source field is metadata unless it itself carries proof-reference
        // shape. Only then does it participate in the controlled proof graph.
        const nested = source.source;
        if (!object(nested) || (!Object.hasOwn(nested, 'path') && !Object.hasOwn(nested, 'sha256'))) return;
        if (!proofReference(nested)) throw Error('receipt source proof reference invalid');
        reference = nested;
      }
    };
    const receipt = (owner, label, isReview = false) => {
      try {
        if (owner?.context_digest !== contextDigest) throw Error('receipt owner context mismatch');
        const bytes = evidence(owner?.evidence, label);
        if (!bytes) return;
        const value = parseQualityJSON(bytes);
        if (!object(value) || value.revision !== current.digest || value.context_digest !== contextDigest || value.context_digest !== expectedContextDigest) throw Error('receipt revision/context mismatch');
        if (isReview && (value.author !== owner.author || value.reviewer !== owner.reviewer)) throw Error('receipt author/reviewer identity mismatch');
        if (typeof value.source?.path !== 'string') throw Error('receipt source path required');
        proofSource(value.source, label, owner.evidence.path);
      } catch (error) { errors.push(`${label} receipt evidence: ${error.message}`); }
    };
    const delta = new Set([...Object.keys(report.baseline.files), ...Object.keys(current.files)].filter(f => report.baseline.files[f] !== current.files[f]));
    const seen = new Set();
    const changes = report.changes;
    if (!Array.isArray(changes)) errors.push('changes inventory required');
    for (const change of Array.isArray(changes) ? changes : []) {
      if (!object(change)) { errors.push('invalid change'); continue; }
      try { canonical(change.path); } catch { errors.push('invalid change path'); continue; }
      if (seen.has(change.path)) errors.push(`duplicate change: ${change.path}`);
      seen.add(change.path);
      if (!delta.has(change.path)) errors.push(`change not in delta: ${change.path}`);
      if (!['functional', 'none'].includes(change.impact) || !text(change.reason)) errors.push(`impact and reason required: ${change.path}`);
      for (const field of ['features', 'acceptance', 'tests', 'docs']) {
        if (!Array.isArray(change[field]) || change[field].some(v => !text(v))) errors.push(`${change.path}: ${field} must be strings`);
        if (change.impact === 'functional' && !change[field]?.length) errors.push(`${change.path}: functional ${field} required`);
      }
      for (const field of ['tests', 'docs']) for (const ref of Array.isArray(change[field]) ? change[field] : []) {
        try { regular(root, ref.split('::')[0].split('#')[0]); } catch { errors.push(`${change.path}: invalid ${field} reference: ${ref}`); }
      }
      if (change.impact === 'functional' && !change.docs?.some(doc => delta.has(doc.split('#')[0]) && current.files[doc.split('#')[0]])) errors.push(`${change.path}: functional documentation not updated`);
    }
    for (const file of delta) if (!seen.has(file)) errors.push(`unclassified change: ${file}`);
    let readme = '';
    try { readme = readQualityFile(root, 'README.md').toString('utf8'); } catch { errors.push('README.md required'); }
    const linked = localMarkdownLinks(readme, root, 'README.md');
    for (const key of ['catalog', 'specification', 'guide', 'history']) {
      const file = report.documentation?.[key];
      try { regular(root, file); } catch { errors.push(`documentation.${key}: regular file required`); }
      if (file !== 'README.md' && !linked.has(file)) errors.push(`README missing documentation link: ${key}`);
    }
    const review = report.review;
    if (!object(review) || !text(review.author) || !text(review.reviewer) || review.author.trim().toLowerCase() === review.reviewer.trim().toLowerCase() || review.independent !== true) errors.push('independent review with author and reviewer required');
    if (review?.revision !== current.digest) errors.push('stale review revision');
    if (review?.documentation_current !== true || review?.security_reviewed !== true) errors.push('semantic documentation and security review required');
    receipt(review, 'review', true);
    const checks = security?.checks;
    if (!Array.isArray(checks)) errors.push('security checks required');
    const checkIds = new Set();
    for (const check of Array.isArray(checks) ? checks : []) {
      if (!object(check) || !['secrets', 'dependencies', 'threat-model'].includes(check.id) || checkIds.has(check.id)) { errors.push('invalid or duplicate security check'); continue; }
      checkIds.add(check.id);
      if (!['PASS', 'NA'].includes(check.status) || !text(check.method)) errors.push(`${check.id}: security status/method required`);
      if (check.status === 'NA' && (!text(check.reason) || /(?:unavailable|not installed|missing tool|indispon[ií]vel|n[aã]o instalad|sem ferramenta)/i.test(check.reason))) errors.push(`${check.id}: NA needs content-based reason, not missing tool`);
      if (check.id === 'threat-model' && security.risk === 'high' && check.status !== 'PASS') errors.push('high risk threat-model must PASS');
      if (check.revision !== current.digest) errors.push(`${check.id}: stale security revision`);
      receipt(check, check.id);
    }
    for (const id of ['secrets', 'dependencies', ...(security?.risk === 'high' ? ['threat-model'] : [])]) if (!checkIds.has(id)) errors.push(`missing security check: ${id}`);
    if (!Array.isArray(security?.findings)) errors.push('security findings array required');
    const findingIds = new Set();
    for (const finding of Array.isArray(security?.findings) ? security.findings : []) {
      if (!object(finding) || !text(finding.id) || findingIds.has(finding.id) || !['critical', 'high', 'medium', 'low'].includes(finding.severity) || !['open', 'fixed'].includes(finding.status)) { errors.push('invalid security finding'); continue; }
      findingIds.add(finding.id);
      if (finding.status === 'open' && ['critical', 'high'].includes(finding.severity)) errors.push(`blocking security finding: ${finding.id}`);
      evidence(finding.evidence, `finding ${finding.id}`);
    }
  } catch (error) { errors.push(error.message); }
  return { ok: errors.length === 0, errors };
}
