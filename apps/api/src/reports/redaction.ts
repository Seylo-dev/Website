/**
 * Last line of defence for troubleshoot reports. The agent redacts secrets before it uploads;
 * this check refuses a report that still looks like it carries one, because a report is
 * readable by anyone who has its link. It never echoes the match back, only the rule and line.
 */

export interface SecretFinding {
  rule: string;
  line: number;
}

interface Rule {
  name: string;
  pattern: RegExp;
  /** Index of the capture group holding the secret value, when the rule matches `key: value`. */
  valueGroup?: number;
}

// What the agent writes in place of a secret. Anything else in a secret-shaped slot is a leak.
const REDACTION_MARKERS = /^(\[redacted\]|<redacted>|\*{3,}|x{3,}|""|''|)$/i;

// Short values in `password: x` lines are usually placeholders ("none", "false", "changeme")
// and flagging them makes reports impossible to upload.
const MIN_GENERIC_SECRET_LENGTH = 8;

const RULES: Rule[] = [
  { name: "private-key", pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/ },
  { name: "aws-access-key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "github-token", pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { name: "slack-token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: "stripe-key", pattern: /\b[rs]k_live_[A-Za-z0-9]{20,}/ },
  { name: "anthropic-key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "openai-key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/ },
  {
    name: "cloudflare-token",
    pattern: /\b(?:CF|CLOUDFLARE)_[A-Z_]*TOKEN\s*[=:]\s*["']?([A-Za-z0-9_-]{30,})/i,
    valueGroup: 1,
  },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: "url-password", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]+)@/i, valueGroup: 1 },
  {
    name: "secret-assignment",
    pattern:
      /\b(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)\b["']?\s*[:=]\s*["']?([^\s"',]+)/i,
    valueGroup: 1,
  },
];

function isLeak(rule: Rule, match: RegExpExecArray): boolean {
  if (rule.valueGroup === undefined) return true;
  const value = match[rule.valueGroup] ?? "";
  if (REDACTION_MARKERS.test(value)) return false;
  return rule.name !== "secret-assignment" || value.length >= MIN_GENERIC_SECRET_LENGTH;
}

export function findUnredactedSecrets(markdown: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  markdown.split("\n").forEach((text, index) => {
    for (const rule of RULES) {
      const match = rule.pattern.exec(text);
      if (match && isLeak(rule, match)) findings.push({ rule: rule.name, line: index + 1 });
    }
  });
  return findings;
}
