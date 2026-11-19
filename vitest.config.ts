import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["ship/bin/**/*.test.mjs", "scripts/**/*.test.mjs"],
    // Falha fechada quando nenhum teste é descoberto.
    passWithNoTests: false,
    // Windows cases launch native PowerShell/Git/Bash subprocesses. Bound file
    // concurrency to avoid oversubscribing those children; preserve every case
    // and its assertions. The default 5 s timed out otherwise valid CLI tests.
    maxWorkers: process.platform === "win32" ? 4 : undefined,
    testTimeout: process.platform === "win32" ? 30_000 : undefined,
  },
});
