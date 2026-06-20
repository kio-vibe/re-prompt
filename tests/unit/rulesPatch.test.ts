import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateAgentsMdPatch } from "../../src/rules/agentsMdPatch.js";
import { buildEvidenceBundle } from "../../src/core/evidence/buildEvidenceBundle.js";
import { extractSignals } from "../../src/core/signals/index.js";
import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { normalizeCodexSession } from "../../src/sources/codex/normalizeCodexSession.js";
import { fixturePath, readFixture } from "../helpers.js";

describe("generateAgentsMdPatch", () => {
  it("dry-runs up to five non-duplicate evidence-based rules", async () => {
    const repo = await mkdtemp(join(tmpdir(), "re-prompt-rules-"));
    const agentsPath = join(repo, "AGENTS.md");
    await writeFile(agentsPath, "# AGENTS.md\n\n- Existing rule.\n", "utf8");

    const parsed = parseCodexJsonl(await readFixture("late-constraint.jsonl"));
    const session = normalizeCodexSession(parsed, {
      transcriptPath: fixturePath("late-constraint.jsonl")
    });
    const bundle = buildEvidenceBundle(session, extractSignals(session));

    const result = await generateAgentsMdPatch({
      repoRoot: repo,
      bundles: [bundle, bundle, bundle],
      maxRules: 5
    });

    expect(result.applied).toBe(false);
    expect(result.rules.length).toBeGreaterThanOrEqual(1);
    expect(result.rules.length).toBeLessThanOrEqual(5);
    expect(result.diff).toContain("Lessons from recent Codex sessions");
    expect(await readFile(agentsPath, "utf8")).toBe("# AGENTS.md\n\n- Existing rule.\n");
  });
});
