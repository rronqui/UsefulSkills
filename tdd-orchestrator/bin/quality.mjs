#!/usr/bin/env node
import path from 'node:path';
import { captureInventory, validateQuality, readQualityJSON, readQualityContext, validateQualityReportFile } from '../lib/quality.mjs';

try {
  const args = process.argv.slice(2);
  let contextPath;
  const flag = args.indexOf('--quality-context');
  if (flag !== -1) {
    contextPath = args[flag + 1];
    if (!contextPath || contextPath.startsWith('--') || args.indexOf('--quality-context', flag + 1) !== -1) throw Error('quality context requires one path');
    args.splice(flag, 2);
  }
  const [command, root, reportPath, stageArg, ...extra] = args;
  const stage = stageArg === undefined ? 'delivery' : stageArg;
  if (!root || extra.length || !['capture', 'check'].includes(command) ||
      (command === 'capture' && (args.length !== 2 || contextPath !== undefined)) ||
      (command === 'check' && (args.length < 3 || !reportPath)) ||
      !['planning', 'delivery'].includes(stage)) throw Error('usage: quality.mjs capture <root> | check <root> <report.json> [planning|delivery] [--quality-context <path>]');
  let result;
  if (command === 'capture') result = captureInventory(root);
  else {
    // Delivery consumes the report through the pinned-file validation seam so
    // its identity and bytes remain bound until the decision is returned.
    const relative = path.isAbsolute(reportPath) ? path.relative(path.resolve(root), reportPath).split(path.sep).join('/') : reportPath;
    if (contextPath !== undefined && path.isAbsolute(contextPath)) contextPath = path.relative(path.resolve(root), contextPath).split(path.sep).join('/');
    if (stage === 'delivery' && contextPath !== undefined) {
      result = validateQualityReportFile(root, relative, contextPath, stage);
    } else {
      const report = readQualityJSON(root, relative);
      const expectedContextDigest = contextPath === undefined ? undefined : readQualityContext(root, contextPath, report, relative);
      result = validateQuality(root, report, { stage, expectedContextDigest });
    }
  }
  console.log(JSON.stringify(result, null, 2));
  if (command === 'check' && !result.ok) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({ ok: false, errors: [error.message] }));
  process.exitCode = 1;
}
