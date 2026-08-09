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
  it("keeps scalar continuation redaction across comments", () => {
    const result = runCapture([
      "password: first-secret",
      "# note",
      "  second-secret",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps scalar redaction after an embedded PEM block", () => {
    const result = runCapture([
      "private_key: |",
      "  -----BEGIN PRIVATE KEY-----",
      "  base64-secret",
      "  -----END PRIVATE KEY-----",
      "  trailing-secret",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-secret");
    expect(result.stdout).not.toContain("trailing-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps flow redaction across contraction apostrophes", () => {
    const result = runCapture([
      "password: {",
      "  value: 'it's }",
      "  still-secret'",
      "  normal: leaked",
      "}",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("leaked");
  });
  it("preserves escaped ERROR_MSG wire framing", () => {
    const result = runCapture(["password: first-secret", String.raw`path: C:\temp\secret`]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(String.raw`ERROR_MSG=<REDACTED>\npath: C:\\temp\\secret`);
    expect(result.stdout.match(/^ERROR_MSG=.*$/m)?.[0]).not.toContain("\n");
  });
  it("redacts a flow opened after closing a multiline quote", () => {
    const result = runCapture([
      'password: "first-secret',
      '", api_key: (',
      "  second-secret",
      ")",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts a bare flow opener in a continuation", () => {
    const result = runCapture([
      "password:",
      "(",
      "  second-secret",
      ")",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts a bare flow after closing an outer flow", () => {
    const result = runCapture([
      "password: {",
      "}",
      "api_key: (",
      "  second-secret",
      ")",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps nested backtick redaction inside a flow", () => {
    const result = runCapture([
      "password: {",
      "  api_key: `",
      "  first-secret",
      "  }",
      "  second-secret",
      "  `",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("second-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps a nested here-string inside an outer flow", () => {
    const result = runCapture([
      "password: {",
      '  api_key: @"',
      '  quote "}',
      "  leaked",
      '"@',
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("leaked");
    expect(result.stdout).toContain("normal: visible");
  });
  it("recognizes a here-string after a multiline quote closes", () => {
    const result = runCapture([
      "password: 'old-secret",
      "', api_key: @\"",
      '  quote "}',
      "  leaked",
      '"@',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("leaked");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps outer redaction for an inline PEM block", () => {
    const result = runCapture([
      "password: { private_key: -----BEGIN PRIVATE KEY-----",
      "base64-inline",
      "-----END PRIVATE KEY-----",
      "other: leaked-secret",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-inline");
    expect(result.stdout).not.toContain("leaked-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps the outer flow redaction after an embedded PEM block", () => {
    const result = runCapture([
      "password: {",
      "private_key: -----BEGIN PRIVATE KEY-----",
      "base64-embedded",
      "-----END PRIVATE KEY-----",
      "other: second-secret",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("base64-embedded");
    expect(result.stdout).not.toContain("second-secret");
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
  it("keeps an unclosed quote inside a sensitive flow redacted", () => {
    const result = runCapture([
      'password: { api_key: "first-secret',
      "  } still-secret",
      'after-secret"',
      "leaked-secret",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still-secret");
    expect(result.stdout).not.toContain("after-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("keeps nested non-sensitive here-strings redacted inside a sensitive flow", () => {
    const result = runCapture([
      "password: {",
      '  note: @"',
      "  nested-secret",
      '"@',
      "leaked-secret",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("nested-secret");
    expect(result.stdout).not.toContain("leaked-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("keeps standalone backtick continuations redacted", () => {
    const result = runCapture([
      "password:",
      "`",
      "backtick-secret",
      "`",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("backtick-secret");
    expect(result.stdout).toContain("normal: visible");
  });

  it("redacts explicit YAML mapping values after a sensitive key", () => {
    const result = runCapture([
      "? password # comment",
      ": explicit-secret",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("explicit-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts PEM data after a scalar continuation mapping", () => {
    const result = runCapture([
      "password:",
      "normal: -----BEGIN PRIVATE KEY-----",
      "  QkFC",
      "-----END PRIVATE KEY-----",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("QkFC");
    expect(result.stdout).toContain("normal: visible");
  });

  it("redacts quoted and bracketed explicit YAML keys", () => {
    const result = runCapture([
      '? "password"',
      ": abc123",
      "? [api_key]",
      ": def456",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("abc123");
    expect(result.stdout).not.toContain("def456");
    expect(result.stdout).toContain("normal: visible");
  });

  it("redacts tagged and anchored explicit YAML keys", () => {
    const cases = [
      ["? !!str password", ": tagged-secret", "tagged-secret"],
      ["? ! password", ": non-specific-tag-secret", "non-specific-tag-secret"],
      ["? &key api_key", ": anchored-secret", "anchored-secret"],
      ['? ["password"]', ": bracket-quoted-secret", "bracket-quoted-secret"],
      ["? ['api_key']", ": bracket-single-quoted-secret", "bracket-single-quoted-secret"],
      ["? [ api_key ]", ": bracket-spaced-secret", "bracket-spaced-secret"],
    ];
    for (const [key, value, secret] of cases) {
      const result = runCapture([key, value, "normal: visible"]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain(secret);
      expect(result.stdout).toContain("normal: visible");
    }
  });
  it("keeps outer flow redaction around nested parenthesized values", () => {
    const result = runCapture([
      "password: { api_key: @(",
      "nested-value",
      ")",
      "leaked-value",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("nested-value");
    expect(result.stdout).not.toContain("leaked-value");
    expect(result.stdout).toContain("normal: visible");
  });
  it("closes outer flow after nested here and backtick values", () => {
    for (const lines of [
      ["password: ( api_key: @\"", "nested-here-secret", "\"@", "nested-here-leaked", ")", "normal: visible"],
      ["password: ( api_key: `", "nested-backtick-secret", "`", "nested-backtick-leaked", ")", "normal: visible"],
    ]) {
      const result = runCapture(lines);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain("nested-here-secret");
      expect(result.stdout).not.toContain("nested-backtick-secret");
      expect(result.stdout).not.toContain("nested-here-leaked");
      expect(result.stdout).not.toContain("nested-backtick-leaked");
      expect(result.stdout).toContain("normal: visible");
    }
  });
  it("does not retain depth for balanced nested @() containers", () => {
    for (const line of ["password: @({ foo: bar })", "password: @([value])"]) {
      const result = runCapture([line, "normal: visible"]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toContain("normal: visible");
    }
  });
  it("keeps PowerShell comment delimiters inside nested flow redacted", () => {
    const result = runCapture([
      "password: @(",
      "value#)",
      "leaked-after-comment",
      ")",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("leaked-after-comment");
    expect(result.stdout).toContain("normal: visible");
  });
  it("does not close a multiline quote on an inline comment quote", () => {
    const result = runCapture([
      'password: "first-secret',
      "continuation # comment",
      "leaked-secret",
      '"',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("leaked-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps literal hash characters inside a quoted scalar", () => {
    const result = runCapture([
      'password: "secret # literal"',
      'normal: "visible"',
      "raw-secret",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("secret # literal");
    expect(result.stdout).toContain('normal: "visible"');
    expect(result.stdout).toContain("raw-secret");
  });
  it("keeps literal hash characters in a multiline quoted flow", () => {
    const result = runCapture([
      "password: {",
      ' value: "first-secret',
      ' still # literal"',
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still # literal");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts explicit YAML block values after a question-mark key", () => {
    const result = runCapture([
      "? password",
      ": |",
      "  abc123",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("abc123");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts explicit YAML flow values after a question-mark key", () => {
    const result = runCapture([
      "? password",
      ": {",
      "  label: value",
      "  abc123",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("abc123");
    expect(result.stdout).toContain("normal: visible");
  });
  it("redacts explicit YAML quoted values after a question-mark key", () => {
    const result = runCapture([
      "? password",
      ': "first-secret',
      "still-secret",
      '"',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps apostrophe contractions inside multiline single-quoted flows", () => {
    const result = runCapture([
      "password: {",
      "  value: 'first-secret",
      "  it's }",
      "  still-secret'",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("does not keep pending state after a closed explicit quote", () => {
    const result = runCapture([
      "? password",
      ': "first-secret"',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).toContain("normal: visible");
  });
  it("keeps same-line nested here-strings redacted inside a flow", () => {
    const result = runCapture([
      'password: { api_key: @"',
      "nested-value",
      '"@',
      "leaked-value",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("nested-value");
    expect(result.stdout).not.toContain("leaked-value");
    expect(result.stdout).toContain("normal: visible");
  });

  it("keeps same-line nested backticks redacted inside a flow", () => {
    const result = runCapture([
      "password: { api_key: `",
      "nested-value",
      "`",
      "leaked-value",
      "}",
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("nested-value");
    expect(result.stdout).not.toContain("leaked-value");
    expect(result.stdout).toContain("normal: visible");
  });
  it("closes a multiline quoted scalar after a literal hash", () => {
    const result = runCapture([
      'password: "first-secret',
      'still # literal"',
      "normal: visible",
    ]);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).not.toContain("first-secret");
    expect(result.stdout).not.toContain("still # literal");
    expect(result.stdout).toContain("normal: visible");
  });
});
