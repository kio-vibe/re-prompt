export interface RedactionResult<T> {
  value: T;
  redactions: { kind: string; count: number }[];
  redactionCount: number;
}

const SECRET_PATTERNS: { kind: string; pattern: RegExp; replacement: string }[] = [
  { kind: "openai_api_key", pattern: /sk-[A-Za-z0-9_-]{20,}/g, replacement: "[REDACTED_OPENAI_KEY]" },
  { kind: "bearer_token", pattern: /Bearer\s+[A-Za-z0-9_\-./+=]{20,}/g, replacement: "Bearer [REDACTED_TOKEN]" },
  {
    kind: "private_key",
    pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]"
  },
  {
    kind: "env_assignment",
    pattern: /\b[A-Z0-9_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*\s*=\s*["']?[^"'\s]+/g,
    replacement: "[REDACTED_ENV_SECRET]"
  },
  {
    kind: "database_url",
    pattern: /\b(?:postgres|postgresql|mysql|mongodb|redis):\/\/[^\s"']+/g,
    replacement: "[REDACTED_DATABASE_URL]"
  },
  {
    kind: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED_EMAIL]"
  }
];

export function redactValue<T>(value: T): RedactionResult<T> {
  const counts = new Map<string, number>();
  const redacted = redactUnknown(value, counts) as T;
  const redactions = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  return {
    value: redacted,
    redactions,
    redactionCount: redactions.reduce((sum, item) => sum + item.count, 0)
  };
}

function redactUnknown(value: unknown, counts: Map<string, number>): unknown {
  if (typeof value === "string") {
    return redactString(value, counts);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactUnknown(item, counts));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, redactUnknown(nested, counts)])
    );
  }
  return value;
}

function redactString(input: string, counts: Map<string, number>): string {
  let output = input;
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern.pattern, (match) => {
      counts.set(pattern.kind, (counts.get(pattern.kind) ?? 0) + 1);
      return pattern.replacement;
    });
  }
  return output;
}
