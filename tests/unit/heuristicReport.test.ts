import { HeuristicOnlyAnalyzer } from "../../src/analyzers/heuristicOnlyAnalyzer.js";
import type { EvidenceBundle } from "../../src/core/types.js";
import { renderMarkdownReport } from "../../src/renderers/markdownRenderer.js";
import { buildEvidenceBundle } from "../../src/core/evidence/buildEvidenceBundle.js";
import { lintRetroReport } from "../../src/core/reportQuality.js";
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

  it("marks unclear goals as low-confidence instead of inventing intent", async () => {
    const bundle = await bundleFromFixture("insufficient-evidence.jsonl");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });
    const markdown = renderMarkdownReport(report);

    expect(report.session.confidence).toBe("low");
    expect(report.session.inferredGoal).toMatch(/unclear/i);
    expect(markdown).toContain("Low confidence");
    expect(markdown).not.toContain("## What you were trying to do\n\ndo it");
  });

  it("grounds repeated-failure rescue prompts in the failing command", async () => {
    const bundle = await bundleFromFixture("repeated-test-failure.jsonl");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("pnpm test auth");
    expect(report.rescuePrompts[0]?.prompt).toContain("pnpm test auth");
    expect(lintRetroReport(report, bundle).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("does not turn a one-off constraint into an AGENTS.md patch", async () => {
    const bundle = await bundleFromFixture("one-off-constraint-no-agents-patch.jsonl");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });

    expect(report.agentsMdPatch.shouldPatch).toBe(false);
    expect(report.findings.some((finding) => finding.suggestedFix.kind === "initial_prompt")).toBe(true);
    expect(lintRetroReport(report, bundle).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("keeps better initial prompts anchored to concrete session facts", async () => {
    const bundle = await bundleFromFixture("generic-misleading-last.jsonl");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });

    expect(report.betterInitialPrompt.prompt).toMatch(/src\/sources\/codex\/locateCodexSessions\.ts|node dist\/cli\.js doctor/);
    expect(lintRetroReport(report, bundle).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("does not copy attachment paths or failed inspection commands into the better prompt", async () => {
    const bundle = await bundleFromFixture("attachment-path-request.jsonl");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });
    const markdown = renderMarkdownReport(report);

    expect(markdown).toContain("Validate whether re-prompt is pointed in the right product direction");
    expect(markdown).not.toContain("/Users/alice");
    expect(report.betterInitialPrompt.prompt).not.toContain("sed -n '1,20p'");
    expect(report.betterInitialPrompt.prompt).toContain("README.md");
  });

  it("marks sessions with follow-up implementation plans as multi-task instead of a single first-turn goal", async () => {
    const bundle = await bundleFromFixture("plan-followups-not-late-constraint.jsonl");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });

    expect(report.session.inferredGoal).toContain("multiple follow-up implementation plans");
    expect(report.session.inferredGoal).toContain("Latest visible request");
    expect(report.betterInitialPrompt.prompt).toContain("Implement the latest provided plan");
    expect(report.session.inferredGoal).not.toBe("Bootstrap the CLI project.");
  });
});

async function bundleFromFixture(name: string): Promise<EvidenceBundle> {
  const parsed = parseCodexJsonl(await readFixture(name));
  const session = normalizeCodexSession(parsed, {
    transcriptPath: fixturePath(name)
  });
  const signals = extractSignals(session);
  return buildEvidenceBundle(session, signals);
}
