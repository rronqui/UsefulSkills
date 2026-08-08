import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATE = "bug-diagnosis/scripts/hitl-loop.template.sh";

function runCapture(lines) {
  const input = ["x", "y", ...lines, "__END__", ""].join("\n");
  return spawnSync("bash", [TEMPLATE], {
    cwd: repoRoot,
    input,
    encoding: "utf8",
    env: { ...process.env, APP_INSTRUCTIONS: "x", ERROR_QUESTION: "q" },
  });
}

describe("hitl-loop redaction", () => {
  it("redacts a new sensitive key after ending scalar continuation", () => {
    const result = runCapture([
      "password:",
      "  first-secret",
      "api_key:",
      "  second-secret",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("keeps redacting until an exact here-string terminator", () => {
    const result = runCapture([
      "password = @\"",
      "\"@not-a-terminator",
      "later-secret",
      "\"@",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("later-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("redacts bracketed multiline quoted values", () => {
    const result = runCapture([
      "cfg['password'] = 'first-secret",
      "second-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("redacts a sensitive key after a closing flow delimiter", () => {
    const result = runCapture([
      "password: {value: first-secret}",
      '}, "api_key":',
      "  second-secret",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts a key that follows a multiline flow close", () => {
    const result = runCapture([
      "password: {",
      "  first-secret",
      '}, "api_key":',
      "  second-secret",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("does not keep quote state after a multiline single quote closes", () => {
    const result = runCapture([
      "password: 'first-secret",
      "second-secret'",
      "api_key: {",
      "  nested: value",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("closes quoted values before comments without redacting later output", () => {
    const result = runCapture([
      "password: 'first-secret' # comment",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("keeps a multiline single-quoted value open after an escaped quote", () => {
    const result = runCapture([
      "password: 'first-secret''",
      "second-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
});
