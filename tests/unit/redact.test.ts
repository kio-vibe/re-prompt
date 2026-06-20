import { redactValue } from "../../src/core/privacy/redact.js";

describe("redactValue", () => {
  it("recursively redacts secrets from strings", () => {
    const input = {
      token: "Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456",
      env: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456",
      nested: ["postgres://user:pass@example.com:5432/app", "me@example.com"]
    };

    const result = redactValue(input);

    expect(JSON.stringify(result.value)).not.toContain("abcdefghijklmnopqrstuvwxyz123456");
    expect(JSON.stringify(result.value)).not.toContain("user:pass");
    expect(JSON.stringify(result.value)).not.toContain("me@example.com");
    expect(result.redactionCount).toBeGreaterThanOrEqual(4);
  });

  it("redacts local home paths without dropping the useful suffix", () => {
    const result = redactValue({
      transcript: "/Users/alice/.codex/sessions/2026/06/20/rollout-test.jsonl",
      linux: "/home/bob/project/src/index.ts"
    });
    const serialized = JSON.stringify(result.value);

    expect(serialized).not.toContain("/Users/alice");
    expect(serialized).not.toContain("/home/bob");
    expect(serialized).toContain("~/.codex/sessions");
    expect(serialized).toContain("~/project/src/index.ts");
  });
});
