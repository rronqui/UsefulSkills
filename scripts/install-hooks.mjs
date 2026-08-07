// Instala os git hooks do projeto (npm prepare roda automaticamente no npm install).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS = ["commit-msg", "pre-push"];

let hooksDir = join(root, ".git", "hooks");
try {
  // Worktree: o core.hooksPath do repositório pode apontar para fora de .git.
  hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (!/^([A-Za-z]:)?[\\/]/.test(hooksDir)) hooksDir = join(root, hooksDir);
} catch {
  // Sem git — nada a instalar.
}

if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

for (const name of HOOKS) {
  const dest = join(hooksDir, name);
  const src = join(root, "scripts", "hooks", `${name}.mjs`);
  copyFileSync(src, `${dest}.mjs`);
  const lines = readFileSync(src, "utf8").split("\n");
  const commentAt = lines.findIndex((l) => l.startsWith("//"));
  if (commentAt !== -1) {
    lines.splice(commentAt, 0, `// Gerado por scripts/install-hooks.mjs — edite o original em scripts/hooks/${name}.mjs.`);
  }
  const banner = [
    "#!/bin/sh",
    `# Gerado por scripts/install-hooks.mjs — edite o original em scripts/hooks/${name}.mjs.`,
    `exec node "${dest.replace(/\\/g, "/")}.mjs"`,
    "",
  ];
  writeFileSync(dest, [...banner, ...lines].join("\n"), { mode: 0o755 });
}
