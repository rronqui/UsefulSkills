import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["ship/bin/**/*.test.mjs", "scripts/**/*.test.mjs"],
    // Falha fechada quando nenhum teste é descoberto.
    passWithNoTests: false,
  },
});
