// Hook commit-msg: valida o título do commit como Conventional Commit
// (exige npx commitlint instalado via devDependencies).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = process.argv[2];
if (!file) process.exit(0);

// Merge/revert/fixup não passam pelo commitlint.
const firstLine = readFileSync(file, "utf8").split("\n")[0] ?? "";
if (/^(Merge|Revert|fixup!|squash!|amend!)/.test(firstLine)) process.exit(0);

// Windows: .bin/commitlint.cmd; Unix: .bin/commitlint.
const cmd = join(process.cwd(), "node_modules", ".bin", process.platform === "win32" ? "commitlint.cmd" : "commitlint");
const bin = existsSync(cmd) ? cmd : "commitlint";
const r = spawnSync(bin, ["--edit", file], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(r.status ?? 1);
