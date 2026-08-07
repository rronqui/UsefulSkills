// Hook commit-msg: valida o título do commit como Conventional Commit
// (exige npx commitlint instalado via devDependencies).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = process.argv[2];
if (!file) process.exit(0);

// Merge/revert/fixup não passam pelo commitlint.
const firstLine = readFileSync(file, "utf8").split("\n")[0] ?? "";
if (/^(Merge\s|Revert\s|fixup!|squash!|amend!)/.test(firstLine)) process.exit(0);

// Resolução em duas camadas:
// 1. entrypoint JS do @commitlint/cli via node com argv array — sem shell,
//    imune a caminhos com espaços/metacaracteres no Windows (shell: true +
//    caminho sem quoting divide 'C:\Ana Silva\repo' em dois tokens).
// 2. fallback .bin/commitlint via shell (PATH pode conter espaços).
const cwd = process.cwd();
const cli = join(cwd, "node_modules", "@commitlint", "cli", "cli.js");
if (existsSync(cli)) {
  const r = spawnSync(process.execPath, [cli, "--edit", file], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}
const cmd = join(cwd, "node_modules", ".bin", process.platform === "win32" ? "commitlint.cmd" : "commitlint");
const bin = existsSync(cmd) ? cmd : "commitlint";
// Windows: .cmd exige cmd.exe, mas NUNCA shell:true com argv separado
// (cmd divide caminhos com espaços). Uma string única /c "<comando>" mantém
// o quoting — cmd não interpreta &|<> dentro de aspas.
const r =
  process.platform === "win32"
    ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `"${bin}" --edit "${file}"`], { stdio: "inherit" })
    : spawnSync(bin, ["--edit", file], { stdio: "inherit" });
process.exit(r.status ?? 1);
