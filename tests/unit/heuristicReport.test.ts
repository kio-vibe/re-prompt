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

  it("redacts local home paths even when the analyzer receives an unredacted bundle", async () => {
    const bundle = minimalFileChurnBundle();
    const localPath = "/Users/alice/project/src/cli.ts";
    bundle.signals[0]!.evidence = [{ turnIndex: 1, eventKind: "file_change", path: localPath }];
    bundle.changedFiles[0]!.path = localPath;
    bundle.anchors[0]!.value = localPath;
    bundle.concreteFacts.changedFiles = [localPath];
    bundle.concreteFacts.repeatedFiles = [localPath];

    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });
    const rendered = JSON.stringify(report);

    expect(rendered).not.toContain("/Users/alice");
    expect(rendered).toContain("~/project/src/cli.ts");
  });

  it("marks sessions with follow-up implementation plans as multi-task instead of a single first-turn goal", async () => {
    const bundle = await bundleFromFixture("plan-followups-not-late-constraint.jsonl");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });

    expect(report.session.inferredGoal).toContain("multiple follow-up implementation plans");
    expect(report.session.inferredGoal).toContain("Latest visible request");
    expect(report.betterInitialPrompt.prompt).toContain("Implement the latest provided plan");
    expect(report.session.inferredGoal).not.toBe("Bootstrap the CLI project.");
  });

  it("keeps unclear follow-up plan sessions low-confidence", async () => {
    const bundle = lowConfidenceFollowUpPlanBundle();
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });

    expect(report.session.confidence).toBe("low");
    expect(report.session.inferredGoal).toMatch(/unclear from the available transcript/i);
    expect(report.session.inferredGoal).toContain("multiple follow-up implementation plans");
    expect(lintRetroReport(report, bundle).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("falls back to an observed anchor when concrete facts are sparse", async () => {
    const bundle = anchorsOnlyBundle();
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });

    expect(report.betterInitialPrompt.prompt).toContain("Observed anchor: `src/pluginWrapper.ts`");
    expect(lintRetroReport(report, bundle).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("keeps the main file-churn evidence focused on the repeated file", async () => {
    const bundle = minimalFileChurnBundle();
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });
    const markdown = renderMarkdownReport(report);
    const whereItGotExpensive = markdown.split("## Findings")[0] ?? "";

    expect(report.executiveSummary).toContain("src/cli.ts");
    expect(report.executiveSummary).toContain("Repeated edits");
    expect(report.executiveSummary.toLowerCase()).not.toContain("same file");
    expect(whereItGotExpensive).toContain("src/cli.ts");
    expect(whereItGotExpensive.toLowerCase()).not.toContain("same file");
    expect(whereItGotExpensive).not.toContain("README.md");
    expect(markdown).toContain("README.md");
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

function minimalFileChurnBundle(): EvidenceBundle {
  return {
    product: "re-prompt",
    bundleVersion: 1,
    session: {
      source: "codex",
      sessionId: "sess-file-churn",
      transcriptPath: "/tmp/rollout-sess-file-churn.jsonl",
      turnCount: 4,
      changedFileCount: 2,
      failedCommandCount: 0
    },
    initialUserPrompt: "Make a small CLI change.",
    timeline: [],
    signals: [
      {
        kind: "file_churn",
        severity: "medium",
        confidence: "medium",
        turnIndex: 1,
        title: "Repeated file edits",
        summary: "src/cli.ts was changed 3 times.",
        evidence: [{ turnIndex: 1, eventKind: "file_change", path: "src/cli.ts" }],
        suggestedActionKind: "rescue_prompt"
      },
      {
        kind: "premature_edit",
        severity: "medium",
        confidence: "medium",
        turnIndex: 2,
        title: "Files changed before visible inspection or planning",
        summary: "README.md changed before planning.",
        evidence: [{ turnIndex: 2, eventKind: "file_change", path: "README.md" }],
        suggestedActionKind: "workflow_change"
      }
    ],
    changedFiles: [
      { path: "src/cli.ts", changeCount: 3, firstTurn: 1, lastTurn: 4 },
      { path: "README.md", changeCount: 1, firstTurn: 2, lastTurn: 2 }
    ],
    failedCommands: [],
    userCorrections: [],
    constraints: [],
    anchors: [
      { kind: "changed_file", value: "src/cli.ts", turnIndex: 1, confidence: "high" },
      { kind: "changed_file", value: "README.md", turnIndex: 2, confidence: "high" }
    ],
    firsts: {
      firstEditTurn: 1
    },
    concreteFacts: {
      changedFiles: ["src/cli.ts", "README.md"],
      repeatedFiles: ["src/cli.ts"],
      commandsRun: [],
      failedCommands: [],
      observedTestCommands: [],
      packageManagers: [],
      lateConstraints: [],
      userCorrections: [],
      errorFingerprints: []
    },
    uncertainty: {
      goalKnown: true,
      outcomeKnown: false,
      verificationKnown: false
    },
    privacy: {
      redactionApplied: false,
      redactionCount: 0
    }
  };
}

function lowConfidenceFollowUpPlanBundle(): EvidenceBundle {
  const bundle = minimalFileChurnBundle();
  return {
    ...bundle,
    session: {
      ...bundle.session,
      sessionId: "sess-unclear-follow-up"
    },
    initialUserPrompt: "Please handle this.",
    timeline: [
      {
        turnIndex: 1,
        user: "Please handle this.",
        fileChanges: ["src/cli.ts"]
      },
      {
        turnIndex: 2,
        user: "PLEASE IMPLEMENT THIS PLAN:\n# Follow-up Plugin Plan\n## Summary\nKeep plugin commands explicit.",
        fileChanges: ["src/cli.ts"]
      }
    ],
    uncertainty: {
      goalKnown: false,
      outcomeKnown: false,
      verificationKnown: false,
      reason: "The initial user prompt did not contain enough concrete task detail."
    }
  };
}

function anchorsOnlyBundle(): EvidenceBundle {
  return {
    product: "re-prompt",
    bundleVersion: 1,
    session: {
      source: "codex",
      sessionId: "sess-anchors-only",
      transcriptPath: "/tmp/rollout-sess-anchors-only.jsonl",
      turnCount: 2,
      changedFileCount: 0,
      failedCommandCount: 0
    },
    initialUserPrompt: "Review the plugin wrapper behavior and keep the command UX clear.",
    timeline: [],
    signals: [
      {
        kind: "verification_gap",
        severity: "medium",
        confidence: "medium",
        turnIndex: 2,
        title: "No verification before completion",
        summary: "The plugin wrapper was discussed without observed verification.",
        evidence: [{ turnIndex: 2, eventKind: "file_change", path: "src/pluginWrapper.ts" }],
        suggestedActionKind: "workflow_change"
      }
    ],
    changedFiles: [],
    failedCommands: [],
    userCorrections: [],
    constraints: [],
    anchors: [{ kind: "changed_file", value: "src/pluginWrapper.ts", turnIndex: 2, confidence: "high" }],
    firsts: {},
    concreteFacts: {
      changedFiles: [],
      repeatedFiles: [],
      commandsRun: [],
      failedCommands: [],
      observedTestCommands: [],
      packageManagers: [],
      lateConstraints: [],
      userCorrections: [],
      errorFingerprints: []
    },
    uncertainty: {
      goalKnown: true,
      outcomeKnown: false,
      verificationKnown: false
    },
    privacy: {
      redactionApplied: false,
      redactionCount: 0
    }
  };
}
