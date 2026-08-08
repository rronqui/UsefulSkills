// Instala os git hooks do projeto (npm prepare roda automaticamente no npm install).
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS = ["commit-msg", "pre-push"];

// Worktree: o core.hooksPath do repositório pode apontar para fora de .git.
let hooksDir;
try {
  hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  console.log("Sem git neste diretório — hooks não instalados.");
  process.exit(0);
}
if (!/^([A-Za-z]:)?[\\/]/.test(hooksDir)) hooksDir = join(root, hooksDir);

let ancestor = hooksDir;
while (true) {
  // Stop at the project boundary; parent system paths are not user-controlled
  // hook destinations and may legitimately be symlinks (for example /var).
  if (ancestor === root) break;
  try {
    if (lstatSync(ancestor).isSymbolicLink()) {
      console.error(`Caminho de hooks contém symlink; recusando escrever: ${ancestor}`);
      process.exit(1);
    }
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  const parent = dirname(ancestor);
  if (parent === ancestor) break;
  ancestor = parent;
}
if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });

const destinations = HOOKS.flatMap((name) => [join(hooksDir, name), `${join(hooksDir, name)}.mjs`]);
for (const dest of destinations) {
  try {
    if (lstatSync(dest).isSymbolicLink()) {
      console.error(`Destino de hook é symlink; recusando sobrescrever: ${dest}`);
      process.exit(1);
    }
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
}

for (const name of HOOKS) {
  const dest = join(hooksDir, name);
  const src = join(root, "scripts", "hooks", `${name}.mjs`);
  copyFileSync(src, `${dest}.mjs`);
  const lines = readFileSync(src, "utf8").split("\n");
  const commentAt = lines.findIndex((l) => l.startsWith("//"));
  if (commentAt !== -1) {
    lines.splice(commentAt, 0, `// Gerado por scripts/install-hooks.mjs — edite o original em scripts/hooks/${name}.mjs.`);
  }
  // "$0.mjs" resolve o sidecar relativo ao próprio wrapper — sem caminho
  // absoluto embutido (imune a expansão de $/crase no /bin/sh).
  // "$@" repassa os argumentos do git (commit-msg precisa do arquivo de mensagem).
  const banner = [
    "#!/bin/sh",
    `# Gerado por scripts/install-hooks.mjs — edite o original em scripts/hooks/${name}.mjs.`,
    `exec node "$0.mjs" "$@"`,
    "",
  ];
  writeFileSync(dest, [...banner, ...lines].join("\n"));
  chmodSync(dest, 0o755); // mode de writeFileSync só vale na criação; força em sobrescrita.
}
