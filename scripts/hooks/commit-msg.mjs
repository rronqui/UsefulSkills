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
const bin = existsSync(cmd) ? cmd : process.platform === "win32" ? "commitlint.cmd" : "commitlint";
// Windows: .cmd exige cmd.exe, mas NUNCA interpolamos os caminhos no comando.
// Variáveis de ambiente fazem uma única expansão; sem `call`, um `%VAR%` contido
// no valor do caminho não é reinterpretado como outra variável.
const r =
  process.platform === "win32"
    ? spawnSync(
        process.env.ComSpec ?? "cmd.exe",
        ["/d", "/s", "/c", `"%COMMITLINT_BIN%" --edit "%COMMIT_MSG_FILE%"`],
        {
          stdio: "inherit",
          env: { ...process.env, COMMITLINT_BIN: bin, COMMIT_MSG_FILE: file },
        },
      )
    : spawnSync(bin, ["--edit", file], { stdio: "inherit" });
process.exit(r.status ?? 1);
