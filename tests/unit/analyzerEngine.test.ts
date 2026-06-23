import { parseEngine } from "../../src/analyzers/engine.js";
import { buildAnalyzerPrompt, extractJsonValue, INTERNAL_ANALYSIS_MARKER } from "../../src/analyzers/cliAnalyzer.js";
import { promptCoachReportJsonSchema } from "../../src/analyzers/coachSchema.js";
import { retroReportJsonSchema } from "../../src/analyzers/reportSchema.js";
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

  it("uses strict object schemas accepted by Codex structured output", () => {
    expect(findLooseObjectSchemas(promptCoachReportJsonSchema)).toEqual([]);
    expect(findLooseObjectSchemas(retroReportJsonSchema)).toEqual([]);
    expect(findObjectSchemasWithMissingRequiredProperties(promptCoachReportJsonSchema)).toEqual([]);
    expect(findObjectSchemasWithMissingRequiredProperties(retroReportJsonSchema)).toEqual([]);
  });
});

function findLooseObjectSchemas(schema: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  const value = schema as Record<string, unknown>;
  const loose: string[] = [];
  if (value.type === "object" && value.additionalProperties !== false) {
    loose.push(path);
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === "properties" && nested && typeof nested === "object") {
      for (const [propertyKey, propertySchema] of Object.entries(nested as Record<string, unknown>)) {
        loose.push(...findLooseObjectSchemas(propertySchema, `${path}.properties.${propertyKey}`));
      }
      continue;
    }
    if (key === "items") {
      loose.push(...findLooseObjectSchemas(nested, `${path}.items`));
      continue;
    }
    if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(nested)) {
      nested.forEach((item, index) => loose.push(...findLooseObjectSchemas(item, `${path}.${key}[${index}]`)));
    }
  }
  return loose;
}

function findObjectSchemasWithMissingRequiredProperties(schema: unknown, path = "$"): string[] {
  if (!schema || typeof schema !== "object") {
    return [];
  }
  const value = schema as Record<string, unknown>;
  const failures: string[] = [];
  if (value.type === "object" && value.properties && typeof value.properties === "object") {
    const propertyKeys = Object.keys(value.properties as Record<string, unknown>).sort();
    const required = Array.isArray(value.required) ? value.required.map(String).sort() : [];
    if (propertyKeys.join("\n") !== required.join("\n")) {
      failures.push(path);
    }
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key === "properties" && nested && typeof nested === "object") {
      for (const [propertyKey, propertySchema] of Object.entries(nested as Record<string, unknown>)) {
        failures.push(...findObjectSchemasWithMissingRequiredProperties(propertySchema, `${path}.properties.${propertyKey}`));
      }
      continue;
    }
    if (key === "items") {
      failures.push(...findObjectSchemasWithMissingRequiredProperties(nested, `${path}.items`));
      continue;
    }
    if ((key === "anyOf" || key === "oneOf" || key === "allOf") && Array.isArray(nested)) {
      nested.forEach((item, index) =>
        failures.push(...findObjectSchemasWithMissingRequiredProperties(item, `${path}.${key}[${index}]`))
      );
    }
  }
  return failures;
}

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
