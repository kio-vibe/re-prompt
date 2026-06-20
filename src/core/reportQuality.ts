import type { EvidenceBundle, EvidenceRef, RetroReport } from "./types.js";

export interface ReportQualityIssue {
  kind:
    | "generic_advice"
    | "missing_evidence"
    | "unsupported_inference"
    | "ungrounded_better_prompt"
    | "over_eager_agents_patch"
    | "missing_rescue_turn"
    | "low_confidence_not_marked";
  severity: "warning" | "error";
  message: string;
}

const GENERIC_ADVICE_RE =
  /\b(be more specific|provide more context|clarify requirements|add acceptance criteria|run tests)\b|테스트를 추가하세요|요구사항을 명확히 하세요|컨텍스트를 더 제공하세요|명확하게 작성하세요/i;
const COMMAND_RE = /`[^`]+`|\b(pnpm|npm|yarn|bun|node|pytest|cargo|go|vitest|jest)\b/i;

export function lintRetroReport(report: RetroReport, bundle: EvidenceBundle): ReportQualityIssue[] {
  return [
    ...lintGenericAdvice(report, bundle),
    ...lintFindingEvidence(report),
    ...lintInferenceConfidence(report, bundle),
    ...lintBetterPrompt(report, bundle),
    ...lintRescuePrompts(report),
    ...lintAgentsPatch(report, bundle)
  ];
}

function lintGenericAdvice(report: RetroReport, bundle: EvidenceBundle): ReportQualityIssue[] {
  const issues: ReportQualityIssue[] = [];
  const snippets = [
    report.executiveSummary,
    report.betterInitialPrompt.prompt,
    report.betterInitialPrompt.whyThisWouldHelp,
    report.agentsMdPatch.rationale,
    report.agentsMdPatch.patchMarkdown,
    ...report.nextSessionChecklist,
    ...report.findings.flatMap((finding) => [
      finding.diagnosis,
      finding.betterBehavior,
      finding.suggestedFix.text
    ]),
    ...report.rescuePrompts.map((rescue) => rescue.prompt)
  ];

  for (const snippet of snippets) {
    if (GENERIC_ADVICE_RE.test(snippet) && !hasConcreteAnchor(snippet, bundle)) {
      issues.push({
        kind: "generic_advice",
        severity: "error",
        message: `Generic advice lacks a concrete session anchor: ${preview(snippet)}`
      });
    }
  }
  return issues;
}

function lintFindingEvidence(report: RetroReport): ReportQualityIssue[] {
  return report.findings
    .filter((finding) => finding.evidence.length === 0 || finding.evidence.some((evidence) => !isValidEvidence(evidence)))
    .map((finding) => ({
      kind: "missing_evidence" as const,
      severity: "error" as const,
      message: `Finding ${finding.id} does not cite valid turn evidence.`
    }));
}

function lintInferenceConfidence(report: RetroReport, bundle: EvidenceBundle): ReportQualityIssue[] {
  const issues: ReportQualityIssue[] = [];
  if (!bundle.uncertainty.goalKnown && report.session.confidence !== "low") {
    issues.push({
      kind: "low_confidence_not_marked",
      severity: "error",
      message: "Goal uncertainty is present but the report is not marked low confidence."
    });
  }
  if (!bundle.uncertainty.goalKnown && !/unclear|not contain enough|cannot infer/i.test(report.session.inferredGoal)) {
    issues.push({
      kind: "unsupported_inference",
      severity: "error",
      message: "The report infers a specific goal despite low goal evidence."
    });
  }
  if (!bundle.uncertainty.outcomeKnown && report.session.outcome !== "unclear") {
    issues.push({
      kind: "unsupported_inference",
      severity: "warning",
      message: "The report assigns a concrete outcome despite low outcome evidence."
    });
  }
  return issues;
}

function lintBetterPrompt(report: RetroReport, bundle: EvidenceBundle): ReportQualityIssue[] {
  const hasAnchorMaterial = bundle.anchors.length > 0;
  if (hasAnchorMaterial && !hasConcreteAnchor(report.betterInitialPrompt.prompt, bundle)) {
    return [
      {
        kind: "ungrounded_better_prompt",
        severity: "error",
        message: "Better initial prompt does not include any concrete anchor from the session."
      }
    ];
  }
  return [];
}

function lintRescuePrompts(report: RetroReport): ReportQualityIssue[] {
  return report.rescuePrompts
    .filter((rescue) => rescue.turnIndex < 1 || !new RegExp(`\\bTurn ${rescue.turnIndex}\\b`, "i").test(rescue.prompt))
    .map((rescue) => ({
      kind: "missing_rescue_turn" as const,
      severity: "error" as const,
      message: `Rescue prompt is not tied to Turn ${rescue.turnIndex}.`
    }));
}

function lintAgentsPatch(report: RetroReport, bundle: EvidenceBundle): ReportQualityIssue[] {
  if (!report.agentsMdPatch.shouldPatch) {
    return [];
  }
  const patchText = [report.agentsMdPatch.rationale, report.agentsMdPatch.patchMarkdown, ...report.agentsMdPatch.rules].join("\n");
  if (GENERIC_ADVICE_RE.test(patchText)) {
    return [
      {
        kind: "over_eager_agents_patch",
        severity: "error",
        message: "AGENTS.md patch contains generic advice."
      }
    ];
  }
  if (!hasDurableAgentsEvidence(bundle)) {
    return [
      {
        kind: "over_eager_agents_patch",
        severity: "error",
        message: "AGENTS.md patch was suggested without durable or repeated evidence."
      }
    ];
  }
  return [];
}

function hasConcreteAnchor(text: string, bundle: EvidenceBundle): boolean {
  if (COMMAND_RE.test(text)) {
    return true;
  }
  return bundle.anchors.some((anchor) => anchor.value.length >= 3 && text.includes(anchor.value));
}

function hasDurableAgentsEvidence(bundle: EvidenceBundle): boolean {
  const repoSpecific =
    bundle.concreteFacts.packageManagers.length > 0 ||
    bundle.concreteFacts.observedTestCommands.length > 0 ||
    bundle.concreteFacts.changedFiles.some((path) => /(^|\/)(package\.json|pnpm-lock\.yaml|AGENTS\.md)$/.test(path));
  const durableEnvironmentGap = bundle.signals.some((signal) => signal.kind === "environment_gap") && repoSpecific;
  return durableEnvironmentGap;
}

function isValidEvidence(evidence: EvidenceRef): boolean {
  return evidence.turnIndex > 0 && Boolean(evidence.quote || evidence.summary || evidence.path || evidence.command);
}

function preview(text: string): string {
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
}
