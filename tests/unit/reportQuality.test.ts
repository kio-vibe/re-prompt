import type { EvidenceBundle, RetroReport } from "../../src/core/types.js";
import { buildEvidenceBundle } from "../../src/core/evidence/buildEvidenceBundle.js";
import { lintRetroReport } from "../../src/core/reportQuality.js";
import { extractSignals } from "../../src/core/signals/index.js";
import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { normalizeCodexSession } from "../../src/sources/codex/normalizeCodexSession.js";
import { fixturePath, readFixture } from "../helpers.js";

describe("ReportQualityLinter", () => {
  it("flags generic advice, missing evidence, unsupported certainty, and ungrounded prompts", () => {
    const bundle = minimalBundle();
    const report: RetroReport = {
      schemaVersion: 1,
      session: {
        source: "codex",
        sessionId: "bad-report",
        title: "Bad report",
        inferredGoal: "The user wanted to refactor the project.",
        outcome: "successful",
        confidence: "high"
      },
      executiveSummary: "Be more specific and provide more context.",
      friction: { score: 80, label: "high", mainCause: "missing_context" },
      turningPoints: [],
      findings: [
        {
          id: "F1",
          title: "Generic finding",
          severity: "medium",
          confidence: "high",
          diagnosis: "Provide more context and clarify requirements.",
          evidence: [],
          betterBehavior: "Be more specific.",
          suggestedFix: { kind: "initial_prompt", text: "Be more specific and run tests." }
        }
      ],
      betterInitialPrompt: {
        prompt: "Be more specific and provide more context.",
        whyThisWouldHelp: "It is clearer.",
        confidence: "high"
      },
      rescuePrompts: [
        {
          turnIndex: 0,
          prompt: "Be more careful and verify your work.",
          useWhen: "When things go wrong.",
          expectedEffect: "Better results.",
          confidence: "high"
        }
      ],
      agentsMdPatch: {
        shouldPatch: true,
        target: "repo",
        rationale: "This seems useful.",
        patchMarkdown: "- Be more specific.",
        rules: ["Be more specific."]
      },
      nextSessionChecklist: ["Provide more context."],
      limitations: []
    };

    const issues = lintRetroReport(report, bundle);

    expect(issues.map((issue) => issue.kind)).toEqual(
      expect.arrayContaining([
        "generic_advice",
        "missing_evidence",
        "unsupported_inference",
        "ungrounded_better_prompt",
        "missing_rescue_turn",
        "over_eager_agents_patch"
      ])
    );
  });

  it("accepts an evidence-grounded late-constraint report", async () => {
    const bundle = await bundleFromFixture("late-constraint.jsonl");
    const { HeuristicOnlyAnalyzer } = await import("../../src/analyzers/heuristicOnlyAnalyzer.js");
    const report = await new HeuristicOnlyAnalyzer().analyze(bundle, { engine: "none" });

    const errors = lintRetroReport(report, bundle).filter((issue) => issue.severity === "error");

    expect(errors).toEqual([]);
  });
});

async function bundleFromFixture(name: string): Promise<EvidenceBundle> {
  const parsed = parseCodexJsonl(await readFixture(name));
  const session = normalizeCodexSession(parsed, { transcriptPath: fixturePath(name) });
  return buildEvidenceBundle(session, extractSignals(session));
}

function minimalBundle(): EvidenceBundle {
  return {
    product: "re-prompt",
    bundleVersion: 1,
    session: {
      source: "codex",
      sessionId: "bad-report",
      transcriptPath: "/tmp/re-prompt/rollout-bad.jsonl",
      turnCount: 2,
      changedFileCount: 1,
      failedCommandCount: 0
    },
    initialUserPrompt: "do it",
    timeline: [],
    signals: [],
    changedFiles: [{ path: "src/core/reportQuality.ts", changeCount: 1, firstTurn: 1, lastTurn: 1 }],
    failedCommands: [],
    userCorrections: [],
    constraints: [],
    anchors: [
      { kind: "changed_file", value: "src/core/reportQuality.ts", turnIndex: 1, confidence: "high" }
    ],
    firsts: { firstEditTurn: 1 },
    concreteFacts: {
      changedFiles: ["src/core/reportQuality.ts"],
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
      goalKnown: false,
      outcomeKnown: false,
      verificationKnown: false,
      reason: "The initial prompt was too short to infer intent."
    },
    privacy: {
      redactionApplied: false,
      redactionCount: 0
    }
  };
}
