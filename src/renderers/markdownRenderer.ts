import type { RetroReport } from "../core/types.js";

export function renderMarkdownReport(report: RetroReport): string {
  const evidenceLines = report.findings.flatMap((finding) =>
    finding.evidence.map((evidence) => {
      const detail = evidence.quote ?? evidence.summary ?? evidence.path ?? evidence.command ?? "Evidence";
      return `- Turn ${evidence.turnIndex}: ${detail}`;
    })
  );

  return [
    "# re-prompt retro",
    "",
    `Source: ${report.session.source}`,
    `Session: ${report.session.sessionId}`,
    `Friction: ${capitalize(report.friction.label)}, ${report.friction.score}/100`,
    `Outcome: ${report.session.outcome}`,
    `Main cause: ${report.friction.mainCause}`,
    "",
    "## What you were trying to do",
    "",
    report.session.inferredGoal,
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
