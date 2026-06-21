import { parseEngine } from "../../src/analyzers/engine.js";
import { buildAnalyzerPrompt, extractJsonValue, INTERNAL_ANALYSIS_MARKER } from "../../src/analyzers/cliAnalyzer.js";
import type { EvidenceBundle, RetroReport } from "../../src/core/types.js";

describe("analyzer engine", () => {
  it("parses supported engines and rejects unknown engines", () => {
    expect(parseEngine("none")).toBe("none");
    expect(parseEngine("codex")).toBe("codex");
    expect(parseEngine("claude")).toBe("claude");
    expect(() => parseEngine("gpt")).toThrow(/Unsupported engine/);
  });

  it("builds a redacted-bundle analyzer prompt with the internal marker", () => {
    const prompt = buildAnalyzerPrompt("codex", minimalBundle());

    expect(prompt).toContain(INTERNAL_ANALYSIS_MARKER);
    expect(prompt).toContain("Redacted EvidenceBundle JSON");
    expect(prompt).toContain("src/cli.ts");
    expect(prompt).not.toContain("encrypted_content");
  });

  it("extracts direct, fenced, and wrapper JSON analyzer outputs", () => {
    const report = minimalReport();

    expect(extractJsonValue(JSON.stringify(report))).toMatchObject({ schemaVersion: 1 });
    expect(extractJsonValue(`\`\`\`json\n${JSON.stringify(report)}\n\`\`\``)).toMatchObject({ schemaVersion: 1 });
    expect(extractJsonValue(JSON.stringify({ result: JSON.stringify(report) }))).toMatchObject({ schemaVersion: 1 });
    expect(() => extractJsonValue("not json")).toThrow(/not valid JSON/);
  });
});

function minimalBundle(): EvidenceBundle {
  return {
    product: "re-prompt",
    bundleVersion: 1,
    session: {
      source: "codex",
      sessionId: "sess-analyzer",
      transcriptPath: "~/.codex/sessions/rollout-sess-analyzer.jsonl",
      turnCount: 1,
      changedFileCount: 1,
      failedCommandCount: 0
    },
    initialUserPrompt: "Update src/cli.ts.",
    timeline: [],
    signals: [],
    changedFiles: [{ path: "src/cli.ts", changeCount: 1, firstTurn: 1, lastTurn: 1 }],
    failedCommands: [],
    userCorrections: [],
    constraints: [],
    anchors: [{ kind: "changed_file", value: "src/cli.ts", turnIndex: 1, confidence: "high" }],
    firsts: { firstEditTurn: 1 },
    concreteFacts: {
      changedFiles: ["src/cli.ts"],
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
      redactionApplied: true,
      redactionCount: 1
    }
  };
}

function minimalReport(): RetroReport {
  return {
    schemaVersion: 1,
    session: {
      source: "codex",
      sessionId: "sess-analyzer",
      title: "Update CLI",
      inferredGoal: "Update `src/cli.ts`.",
      outcome: "unclear",
      confidence: "medium"
    },
    executiveSummary: "Turn 1 touched `src/cli.ts`.",
    friction: {
      score: 20,
      label: "low",
      mainCause: "other"
    },
    turningPoints: [],
    findings: [
      {
        id: "F1",
        title: "CLI file changed",
        severity: "low",
        confidence: "medium",
        diagnosis: "`src/cli.ts` changed.",
        evidence: [{ turnIndex: 1, eventKind: "file_change", path: "src/cli.ts" }],
        betterBehavior: "Keep future prompts anchored to `src/cli.ts`.",
        suggestedFix: { kind: "initial_prompt", text: "Mention `src/cli.ts` up front." }
      }
    ],
    betterInitialPrompt: {
      prompt: "Update `src/cli.ts` and verify the CLI behavior.",
      whyThisWouldHelp: "It keeps the request anchored to `src/cli.ts`.",
      confidence: "medium"
    },
    rescuePrompts: [],
    agentsMdPatch: {
      shouldPatch: false,
      target: "none",
      rationale: "No durable rule.",
      patchMarkdown: "",
      rules: []
    },
    nextSessionChecklist: ["Check `src/cli.ts`."],
    limitations: ["Local analysis only."]
  };
}
