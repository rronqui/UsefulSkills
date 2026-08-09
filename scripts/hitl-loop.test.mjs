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
  it("redacts indented continuation after a plain sensitive scalar", () => {
    const result = runCapture([
      "password: first-secret",
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

  it("redacts scalar and backtick continuations after a multiline flow close", () => {
    const result = runCapture([
      "password: {",
      "  first-secret",
      "}, api_key: `",
      "  second-secret",
      "`",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps flow state after a quote closes before an @{} value", () => {
    const result = runCapture([
      'password: "first-secret',
      '", api_key: @{',
      "nested = second-secret",
      "other = third-secret",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).not.toContain("third-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps flow state when a backtick-escaped quote contains a delimiter", () => {
    const result = runCapture([
      "password = @{",
      'value = "first`"}',
      'still-secret"',
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first");
    expect(result.stdout).not.toContain("still-secret");
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
  it("redacts a PEM header reached through scalar continuation", () => {
    const result = runCapture([
      "password:",
      "-----BEGIN PRIVATE KEY-----",
      "base64-secret",
      "-----END PRIVATE KEY-----",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("does not close a PEM block on a fake certificate marker", () => {
    const result = runCapture([
      "private_key: -----BEGIN PRIVATE KEY-----",
      "base64-first",
      "note: -----END CERTIFICATE-----",
      "base64-second",
      "-----END PRIVATE KEY-----",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-first");
    expect(result.stdout).not.toContain("base64-second");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps a PEM block open until the matching footer type", () => {
    const result = runCapture([
      "private_key: -----BEGIN RSA PRIVATE KEY-----",
      "base64-first",
      "-----END PRIVATE KEY-----",
      "base64-second",
      "-----END RSA PRIVATE KEY-----",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-first");
    expect(result.stdout).not.toContain("base64-second");
    expect(result.stdout).toContain("normal: visible");
  });


  it("keeps a backtick-escaped double quote inside a multiline value", () => {
    const result = runCapture([
      'password = "first-secret',
      '  `"still-secret',
      '  later-secret"',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still-secret");
    expect(result.stdout).not.toContain("later-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("does not keep quote state for apostrophes in plain or double-quoted values", () => {
    const result = runCapture([
      "password: \"don't\"",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("normal: visible");
  });

  it("does not enter quote state for quoted keys with plain values", () => {
    const result = runCapture([
      "'password': plain-value",
      "cfg['password'] = another-value",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("plain-value");
    expect(result.stdout).not.toContain("another-value");
    expect(result.stdout).toContain("normal: visible");
  });

  it("selects the later sensitive field in a multi-field record", () => {
    const result = runCapture([
      "api_key: don't, password: 'first-secret",
      "second-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps a multiline value open when the quoted key contains a colon", () => {
    const result = runCapture([
      "'password:foo': 'first-secret",
      "second-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });



  it("does not accept an indented here-string marker", () => {
    const result = runCapture([
      'password = @"',
      '  "@',
      "later-secret",
      '"@',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("later-secret");
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
  it("keeps flow depth while a multiline quoted value contains a brace", () => {
    const result = runCapture([
      "password: {",
      'value: "first-secret',
      ' }"',
      "  second-secret",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("does not close a multiline single quote on a doubled apostrophe", () => {
    const result = runCapture([
      "password: 'first-secret",
      "it's still-secret''",
      "second-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("redacts a here-string opened after a flow closes", () => {
    const result = runCapture([
      "password: {",
      "  first-secret",
      '}, api_key: @"',
      "second-secret",
      '"@',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts a new flow value after closing a previous flow", () => {
    const result = runCapture([
      "password: {",
      "  first-secret",
      "}, api_key: {",
      "normal: nested-secret",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("nested-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts annotated PEM headers", () => {
    const result = runCapture([
      "private_key: -----BEGIN PRIVATE KEY----- # note",
      "base64-first",
      "base64-second",
      "-----END PRIVATE KEY-----",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-first");
    expect(result.stdout).not.toContain("base64-second");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts a PEM block following scalar continuation", () => {
    const result = runCapture([
      "password:",
      "normal: -----BEGIN PRIVATE KEY-----",
      "base64-secret",
      "-----END PRIVATE KEY-----",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts escaped apostrophes in multiline quoted values", () => {
    const result = runCapture([
      "password: 'first-secret\\'still",
      "final-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still");
    expect(result.stdout).not.toContain("final-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts a new quoted field after a flow closes", () => {
    const result = runCapture([
      "password: {",
      "  first-secret",
      "}, api_key: 'new-secret",
      "next-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("new-secret");
    expect(result.stdout).not.toContain("next-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("redacts a new quoted field after an earlier quote closes", () => {
    const result = runCapture([
      "password: 'old-secret",
      "', api_key: 'new-secret",
      "next-secret'",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("old-secret");
    expect(result.stdout).not.toContain("new-secret");
    expect(result.stdout).not.toContain("next-secret");
    expect(result.stdout).toContain("normal: visible");
  });
});
