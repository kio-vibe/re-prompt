import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { readFixture } from "../helpers.js";

describe("parseCodexJsonl", () => {
  it("parses stored rollout events and preserves known top-level types", async () => {
    const parsed = parseCodexJsonl(await readFixture("simple-success.jsonl"));

    expect(parsed.errors).toEqual([]);
    expect(parsed.events[0]?.type).toBe("session_meta");
    expect(parsed.stats.rawLineCount).toBe(14);
    expect(parsed.stats.unknownEventCount).toBe(0);
    expect(parsed.events.some((event) => event.type === "response_item")).toBe(true);
  });

  it("records malformed lines and unknown event previews without throwing", async () => {
    const parsed = parseCodexJsonl(await readFixture("malformed-lines.jsonl"));

    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0]).toMatchObject({ lineNumber: 2 });
    expect(parsed.stats.unknownEventCount).toBe(1);
    expect(parsed.unknownEvents[0]?.preview).toContain("mystery_event");
  });

  it("handles empty files", async () => {
    const parsed = parseCodexJsonl(await readFixture("empty.jsonl"));

    expect(parsed.events).toEqual([]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.stats.rawLineCount).toBe(0);
  });
});
