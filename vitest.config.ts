import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["ship/bin/**/*.test.mjs", "scripts/**/*.test.mjs"],
    // Suíte nasce vazia no bootstrap; os testes do motor entram no ciclo seguinte.
    passWithNoTests: true,
  },
});
