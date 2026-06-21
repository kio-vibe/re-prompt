import type { RetroReport } from "../core/types.js";

export function renderMarkdownReport(report: RetroReport): string {
  const mainFinding = report.findings[0];
  const evidenceLines = (mainFinding?.evidence ?? []).map((evidence) => {
    const detail = evidence.quote ?? evidence.summary ?? evidence.path ?? evidence.command ?? "Evidence";
    return `- Turn ${evidence.turnIndex}: ${detail}`;
  });
  const evidenceSection = evidenceLines.length > 0 ? ["Evidence:", ...evidenceLines] : ["Evidence: not enough turn evidence available."];
  const findingLines = report.findings.flatMap((finding) =>
    [
      `- ${finding.id}: ${finding.title} (Turn ${finding.evidence[0]?.turnIndex ?? "?"})`,
      ...finding.evidence.slice(0, 2).map((evidence) => {
        const detail = evidence.quote ?? evidence.summary ?? evidence.path ?? evidence.command ?? "Evidence";
        return `  Evidence: Turn ${evidence.turnIndex}: ${detail}`;
      })
    ]
  );
  const selectionLines = report.selection
    ? [
        "Selected session:",
        `- Source: ${report.selection.source}`,
        `- Session: ${report.selection.sessionId}`,
        `- Transcript: ${report.selection.transcriptPath}`,
        `- Selected because: ${report.selection.selectedBecause}`,
        report.selection.startedAt ? `- Started: ${report.selection.startedAt}` : undefined,
        `- Turns analyzed: ${report.selection.turnsAnalyzed}`,
        report.selection.skippedNewerSessions
          ? `- Skipped newer sessions: ${formatSkippedSessions(report.selection.skippedNewerSessions)}`
          : undefined,
        `- Selection confidence: ${report.selection.confidence}`,
        report.selection.confidenceReason ? `- Confidence note: ${report.selection.confidenceReason}` : undefined,
        ""
      ].filter((line): line is string => Boolean(line))
    : [];
  const analysisLines = report.analysis
    ? [
        `Analyzer: requested ${report.analysis.requestedEngine}, used ${report.analysis.usedEngine}${
          report.analysis.fallback ? " (fallback)" : ""
        }`,
        report.analysis.fallbackReason ? `Analyzer note: ${report.analysis.fallbackReason}` : undefined,
        ""
      ].filter((line): line is string => Boolean(line))
    : [];

  return [
    "# re-prompt retro",
    "",
    ...selectionLines,
    `Source: ${report.session.source}`,
    `Session: ${report.session.sessionId}`,
    `Friction: ${capitalize(report.friction.label)}, ${report.friction.score}/100`,
    `Outcome: ${report.session.outcome}`,
    `Main cause: ${report.friction.mainCause}`,
    ...analysisLines,
    "",
    "## What you were trying to do",
    "",
    report.session.confidence === "low" ? `Low confidence: ${report.session.inferredGoal}` : report.session.inferredGoal,
    "",
    "## Where it got expensive",
    "",
    report.executiveSummary,
    "",
    ...evidenceSection,
    "",
    "## Findings",
    "",
    ...findingLines,
    "",
    "## Better initial prompt",
    "",
    "```txt",
    report.betterInitialPrompt.prompt,
    "```",
    "",
    ...report.rescuePrompts.flatMap((rescue) => [
      `## Better rescue prompt at Turn ${rescue.turnIndex}`,
      "",
      "```txt",
      rescue.prompt,
      "```",
      ""
    ]),
    "## Suggested AGENTS.md patch",
    "",
    report.agentsMdPatch.shouldPatch ? "```md" : "",
    report.agentsMdPatch.shouldPatch ? report.agentsMdPatch.patchMarkdown : "No durable AGENTS.md rule suggested.",
    report.agentsMdPatch.shouldPatch ? "```" : "",
    "",
    "## Next session checklist",
    "",
    ...report.nextSessionChecklist.map((item) => `- ${item}`),
    "",
    "## Limitations",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    ""
  ]
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === "" && lines[index + 1] === ""))
    .join("\n");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatSkippedSessions(skipped: { tooLarge: number; parseFailed: number; other: number }): string {
  const parts = [
    skipped.tooLarge > 0 ? `${skipped.tooLarge} too_large` : undefined,
    skipped.parseFailed > 0 ? `${skipped.parseFailed} parse_failed` : undefined,
    skipped.other > 0 ? `${skipped.other} other` : undefined
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "0";
}
