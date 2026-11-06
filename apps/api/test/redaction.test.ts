import { describe, expect, test } from "bun:test";
import { findUnredactedSecrets } from "../src/reports/redaction";

describe("findUnredactedSecrets", () => {
  test("passes a clean report", () => {
    const report = [
      "# Report",
      "Docker 27.5.1",
      "DATABASE_URL=postgres://app:[REDACTED]@db:5432/app",
      "password: ***",
    ].join("\n");
    expect(findUnredactedSecrets(report)).toEqual([]);
  });

  test.each([
    ["private-key", "-----BEGIN OPENSSH PRIVATE KEY-----"],
    ["aws-access-key", "key AKIAIOSFODNN7EXAMPLE here"],
    ["github-token", `token ghp_${"a".repeat(36)}`],
    // Fake values that only exist to trip the rules; gitleaks:allow keeps secret scanners quiet about them.
    ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"], // gitleaks:allow
    ["url-password", "postgres://app:s3cretpass@db:5432/app"],
    ["secret-assignment", "API_KEY=abcdef0123456789"], // gitleaks:allow
  ])("flags %s", (rule, line) => {
    expect(findUnredactedSecrets(`ok\n${line}`)).toContainEqual({ rule, line: 2 });
  });

  test("ignores short placeholder values", () => {
    expect(findUnredactedSecrets("password: none\ntoken = false")).toEqual([]);
  });
});
