import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { normalizeCodexSession } from "../../src/sources/codex/normalizeCodexSession.js";
import { fixturePath, readFixture } from "../helpers.js";

describe("normalizeCodexSession", () => {
  it("normalizes session metadata, turns, commands, file changes, and final messages", async () => {
    const parsed = parseCodexJsonl(await readFixture("simple-success.jsonl"));
    const session = normalizeCodexSession(parsed, {
      transcriptPath: fixturePath("simple-success.jsonl")
    });

    expect(session.sessionId).toBe("sess-simple");
    expect(session.cwd).toBe("/tmp/demo");
    expect(session.turns).toHaveLength(1);
    expect(session.turns[0]?.userMessages[0]?.text).toBe("Update README title only.");
    expect(session.turns[0]?.commandExecutions[0]).toMatchObject({
      command: "sed -n '1,40p' README.md",
      exitCode: undefined
    });
    expect(session.turns[0]?.commandExecutions[1]).toMatchObject({
      command: "pnpm test",
      exitCode: 0
    });
    expect(session.turns[0]?.fileChanges[0]).toMatchObject({
      path: "README.md",
      changeKind: "modified"
    });
    expect(session.turns[0]?.assistantMessages.at(-1)?.text).toContain("verified");
    expect(JSON.stringify(session)).not.toContain("sealed");
  });

  it("keeps parser stats on malformed transcripts", async () => {
    const parsed = parseCodexJsonl(await readFixture("malformed-lines.jsonl"));
    const session = normalizeCodexSession(parsed, {
      transcriptPath: fixturePath("malformed-lines.jsonl")
    });

    expect(session.rawStats.parseErrorCount).toBe(1);
    expect(session.rawStats.unknownEventCount).toBe(1);
  });
});
