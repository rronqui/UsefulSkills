import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGitSession } from "./lib/git-trust-source.mjs";

import { windowsHostPath } from "../tdd-orchestrator/lib/fs-transaction/index.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, "scripts", "hooks", "pre-push.mjs");
const BEGIN = "// BEGIN GENERATED GIT TRUST (do not edit)";
const END = "// END GENERATED GIT TRUST";


function renderBlock() {
  const source = createGitSession.toString();
  const hostSource = windowsHostPath.toString();
  return [
    BEGIN,
    "const __gitTrustFailure = (message) => { const error = new Error(message); error.code = 'E_UNSAFE_GIT_EXECUTABLE'; return error; };",
    "const failure = __gitTrustFailure;",
    `const __windowsHostPath = ${hostSource};`,
    `const __createGitSession = ${source};`,
    END,
  ].join("\n");
}

function materialize(existing, block) {
  const start = existing.indexOf(BEGIN);
  const finish = existing.indexOf(END);
  if (start < 0 || finish < 0 || finish < start) {
    throw new Error("pre-push generated Git trust markers are missing or malformed");
  }
  const end = finish + END.length;
  return `${existing.slice(0, start)}${block}${existing.slice(end)}`;
}

const block = renderBlock();
const current = readFileSync(target, "utf8");
const generated = materialize(current, block);
if (process.argv.includes("--check")) {
  if (generated !== current) {
    console.error("[git-trust] pre-push is stale; run node scripts/generate-git-trust.mjs");
    process.exitCode = 1;
  }
} else {
  writeFileSync(target, generated, "utf8");
}

