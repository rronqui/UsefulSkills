// Guardrail local: impede push direto na main — mudanças entram via PR.
// O git passa as refs pela stdin: uma linha por ref no formato
// "<local ref> <local sha> <remote ref> <remote sha>".
// Bypass explícito: git push --no-verify.
import { readFileSync } from "node:fs";

let input = "";
try {
  input = readFileSync(0, "utf8");
} catch {
  process.exit(0);
}

for (const line of input.split("\n")) {
  const localRef = line.split(" ")[0];
  if (localRef === "refs/heads/main") {
    console.error("\n[pre-push] Push direto na 'main' está bloqueado.");
    console.error("[pre-push] Crie uma branch, abra um PR e faça o merge via GitHub.\n");
    process.exit(1);
  }
}
process.exit(0);
