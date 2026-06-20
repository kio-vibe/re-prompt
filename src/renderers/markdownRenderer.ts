import type { RetroReport } from "../core/types.js";

export function renderMarkdownReport(report: RetroReport): string {
  const evidenceLines = report.findings.flatMap((finding) =>
    finding.evidence.map((evidence) => {
      const detail = evidence.quote ?? evidence.summary ?? evidence.path ?? evidence.command ?? "Evidence";
      return `- Turn ${evidence.turnIndex}: ${detail}`;
    })
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

  return [
    "# re-prompt retro",
    "",
    ...selectionLines,
    `Source: ${report.session.source}`,
    `Session: ${report.session.sessionId}`,
    `Friction: ${capitalize(report.friction.label)}, ${report.friction.score}/100`,
    `Outcome: ${report.session.outcome}`,
    `Main cause: ${report.friction.mainCause}`,
    "",
    "## What you were trying to do",
    "",
    report.session.confidence === "low" ? `Low confidence: ${report.session.inferredGoal}` : report.session.inferredGoal,
    "",
    "## Where it got expensive",
    "",
    report.executiveSummary,
    "",
    "Evidence:",
    ...evidenceLines,
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
