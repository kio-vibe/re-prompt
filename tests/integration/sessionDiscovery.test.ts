import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { locateCodexSessions, readSessionMetaPrefix, resolveSessionReference } from "../../src/sources/codex/locateCodexSessions.js";

describe("session discovery", () => {
  it("finds stored rollout sessions under CODEX_HOME sorted by mtime", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-codex-home-"));
    const day = join(codexHome, "sessions", "2026", "06", "20");
    await mkdir(day, { recursive: true });
    const oldPath = join(day, "rollout-2026-06-20T01-00-00-old.jsonl");
    const newPath = join(day, "rollout-2026-06-20T02-00-00-new.jsonl");
    await writeFile(oldPath, "{\"type\":\"session_meta\",\"payload\":{\"id\":\"old\",\"cwd\":\"/tmp/a\"}}\n", "utf8");
    await writeFile(newPath, "{\"type\":\"session_meta\",\"payload\":{\"id\":\"new\",\"cwd\":\"/tmp/a\"}}\n", "utf8");

    const sessions = await locateCodexSessions({ codexHome });

    expect(sessions.map((session) => session.sessionId)).toEqual(["new", "old"]);
    await expect(resolveSessionReference("new", { codexHome })).resolves.toMatchObject({
      sessionId: "new",
      transcriptPath: newPath
    });
  });

  it("extracts metadata from only the prefix of a large rollout file", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-large-codex-home-"));
    const day = join(codexHome, "sessions", "2026", "06", "20");
    await mkdir(day, { recursive: true });
    const largePath = join(day, "rollout-2026-06-20T03-00-00-large.jsonl");
    const metaLine = "{\"type\":\"session_meta\",\"payload\":{\"id\":\"large\",\"cwd\":\"/tmp/large\",\"timestamp\":\"2026-06-20T03:00:00.000Z\"}}\n";
    await writeFile(largePath, `${metaLine}${"x".repeat(2_000_000)}`, "utf8");

    await expect(readSessionMetaPrefix(largePath, 4096)).resolves.toMatchObject({
      sessionId: "large",
      cwd: "/tmp/large"
    });

    const sessions = await locateCodexSessions({ codexHome });
    expect(sessions[0]).toMatchObject({
      sessionId: "large",
      sizeBytes: expect.any(Number)
    });
  });

  it("excludes internal analyzer sessions from discovery", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-internal-codex-home-"));
    const day = join(codexHome, "sessions", "2026", "06", "20");
    await mkdir(day, { recursive: true });
    const visiblePath = join(day, "rollout-2026-06-20T01-00-00-visible.jsonl");
    const internalPath = join(day, "rollout-2026-06-20T02-00-00-internal.jsonl");
    await writeFile(visiblePath, "{\"type\":\"session_meta\",\"payload\":{\"id\":\"visible\",\"cwd\":\"/tmp/a\"}}\n", "utf8");
    await writeFile(
      internalPath,
      [
        "{\"type\":\"session_meta\",\"payload\":{\"id\":\"internal\",\"cwd\":\"/tmp/a\"}}",
        "{\"type\":\"event_msg\",\"payload\":{\"message\":\"RE_PROMPT_INTERNAL_ANALYSIS\"}}"
      ].join("\n"),
      "utf8"
    );

    const sessions = await locateCodexSessions({ codexHome });

    expect(sessions.map((session) => session.sessionId)).toEqual(["visible"]);
  });
});
