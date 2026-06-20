import { HeuristicOnlyAnalyzer } from "../../src/analyzers/heuristicOnlyAnalyzer.js";
import { renderMarkdownReport } from "../../src/renderers/markdownRenderer.js";
import { buildEvidenceBundle } from "../../src/core/evidence/buildEvidenceBundle.js";
import { extractSignals } from "../../src/core/signals/index.js";
import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { normalizeCodexSession } from "../../src/sources/codex/normalizeCodexSession.js";
import { fixturePath, readFixture } from "../helpers.js";

describe("heuristic report", () => {
  it("produces evidence-based markdown with a concrete prompt and no generic filler", async () => {
    const parsed = parseCodexJsonl(await readFixture("late-constraint.jsonl"));
    const session = normalizeCodexSession(parsed, {
      transcriptPath: fixturePath("late-constraint.jsonl")
    });
    const signals = extractSignals(session);
    const bundle = buildEvidenceBundle(session, signals);

    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("# re-prompt retro");
    expect(markdown).toContain("Turn 2");
    expect(markdown).toContain("public API response shape");
    expect(markdown).toContain("## Better initial prompt");
    expect(markdown).not.toContain("Be more specific");
    expect(markdown).not.toContain("Provide more context");
  });
});
