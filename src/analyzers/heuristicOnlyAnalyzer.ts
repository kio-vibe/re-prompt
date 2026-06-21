import type { Analyzer, AnalyzerOptions } from "./Analyzer.js";
import type { EvidenceBundle, EvidenceRef, Finding, RetroReport, RescuePrompt, SessionSignal } from "../core/types.js";
import { frictionLabel } from "../core/scoring/frictionScore.js";
import { truncate } from "../core/text.js";
import { isActionableFailedCommand, isImplementationPlanPrompt } from "../core/commands.js";

export class HeuristicOnlyAnalyzer implements Analyzer {
  public async analyze(bundle: EvidenceBundle, _options: AnalyzerOptions): Promise<RetroReport> {
    const score = computeScoreFromBundle(bundle);
    const mainSignal = bundle.signals[0];
    const goal = inferGoal(bundle);
    const findings = bundle.signals.map((signal, index) => signalToFinding(signal, bundle, index + 1));
    const rescuePrompts = bundle.signals
      .filter((signal) => signal.suggestedActionKind === "rescue_prompt")
      .map((signal) => signalToRescuePrompt(signal, bundle));
    const rules = buildRules(bundle);

    return {
      schemaVersion: 1,
      session: {
        source: "codex",
        sessionId: bundle.session.sessionId,
        title: inferTitle(bundle, goal),
        inferredGoal: goal.text,
        outcome: inferOutcome(bundle),
        confidence: goal.confidence
      },
      executiveSummary: mainSignal
        ? `${mainSignal.title}: ${signalDiagnosis(mainSignal, bundle)}`
        : "No high-friction signal was detected in this session.",
      friction: {
        score,
        label: frictionLabel(score),
        mainCause: mapMainCause(mainSignal?.kind)
      },
      turningPoints: bundle.signals.map((signal) => ({
        turnIndex: signal.turnIndex,
        title: signal.title,
        whatHappened: signalDiagnosis(signal, bundle),
        whyItMattered: whySignalMatters(signal, bundle),
        evidence: signal.evidence
      })),
      findings,
      betterInitialPrompt: {
        prompt: buildBetterInitialPrompt(bundle, goal),
        whyThisWouldHelp: mainSignal
          ? `This moves the concrete lesson from Turn ${mainSignal.turnIndex} into the first prompt.`
          : "This asks Codex to inspect, plan, and verify without inventing missing context.",
        confidence: mainSignal ? mainSignal.confidence : goal.confidence
      },
      rescuePrompts,
      agentsMdPatch: {
        shouldPatch: rules.length > 0,
        target: rules.length > 0 ? "repo" : "none",
        rationale:
          rules.length > 0
            ? "The lesson is tied to durable repo evidence rather than a one-off session constraint."
            : "No durable AGENTS.md rule was detected from this single session.",
        patchMarkdown: rules.map((rule) => `- ${rule}`).join("\n"),
        rules
      },
      nextSessionChecklist: buildChecklist(bundle),
      limitations: [
        "This report used deterministic local heuristics.",
        "Transcript parsing is best-effort and may miss new Codex event shapes.",
        "Low-confidence sections intentionally avoid inferring goals that are not visible in the transcript."
      ]
    };
  }
}

function computeScoreFromBundle(bundle: EvidenceBundle): number {
  const base = Math.min(bundle.session.turnCount * 1.5, 25);
  const failedCommandScore = bundle.session.failedCommandCount * 5;
  const signalScore = bundle.signals.reduce((sum, signal) => {
    const weight =
      signal.kind === "repeated_failure"
        ? 14
        : signal.kind === "late_constraint"
          ? 12
          : signal.kind === "user_correction" || signal.kind === "scope_drift"
            ? 10
            : signal.kind === "verification_gap" || signal.kind === "file_churn"
              ? 8
              : 6;
    return sum + weight;
  }, 0);
  return Math.min(100, Math.round(base + failedCommandScore + signalScore));
}

function signalToFinding(signal: SessionSignal, bundle: EvidenceBundle, index: number): Finding {
  const suggestedFix =
    signal.suggestedActionKind === "rescue_prompt"
      ? ({ kind: "rescue_prompt", turnIndex: signal.turnIndex, text: buildRescuePrompt(signal, bundle) } as const)
      : signal.kind === "verification_gap"
        ? ({
            kind: "workflow",
            text: `At Turn ${signal.turnIndex}, completion needed an observed verification command before reporting done.`
          } as const)
        : ({ kind: "initial_prompt", text: buildInitialPromptClause(signal, bundle) } as const);

  return {
    id: `F${index}`,
    title: signal.title,
    severity: signal.severity,
    confidence: signal.confidence,
    diagnosis: signalDiagnosis(signal, bundle),
    evidence: signal.evidence,
    betterBehavior: whySignalMatters(signal, bundle),
    suggestedFix
  };
}

function signalToRescuePrompt(signal: SessionSignal, bundle: EvidenceBundle): RescuePrompt {
  return {
    turnIndex: signal.turnIndex,
    prompt: buildRescuePrompt(signal, bundle),
    useWhen: `Use at Turn ${signal.turnIndex} when ${signal.title.toLowerCase()}.`,
    expectedEffect: "Stops the current trajectory and forces a grounded plan before more edits.",
    confidence: signal.confidence
  };
}

function signalDiagnosis(signal: SessionSignal, bundle: EvidenceBundle): string {
  if (signal.kind === "late_constraint") {
    const constraint = evidenceText(signal.evidence) ?? bundle.concreteFacts.lateConstraints[0] ?? "a later constraint";
    const firstEdit = bundle.firsts.firstEditTurn;
    return firstEdit && firstEdit < signal.turnIndex
      ? `Turn ${signal.turnIndex} introduced this constraint after edits had started at Turn ${firstEdit}: "${truncate(constraint, 180)}"`
      : `Turn ${signal.turnIndex} introduced this constraint: "${truncate(constraint, 180)}"`;
  }
  if (signal.kind === "user_correction") {
    const correction = evidenceText(signal.evidence) ?? bundle.concreteFacts.userCorrections[0] ?? "the user corrected direction";
    return `Turn ${signal.turnIndex} corrected the direction: "${truncate(correction, 180)}"`;
  }
  if (signal.kind === "repeated_failure") {
    const command = firstEvidenceCommand(signal.evidence) ?? bundle.concreteFacts.failedCommands[0] ?? "the same command";
    const fingerprint = bundle.concreteFacts.errorFingerprints[0];
    return fingerprint
      ? `The command \`${command}\` repeated the same failure fingerprint: ${truncate(fingerprint, 180)}`
      : `The command \`${command}\` repeated the same failure pattern.`;
  }
  if (signal.kind === "verification_gap") {
    const changed = bundle.concreteFacts.changedFiles.slice(0, 3).map(formatCode).join(", ");
    return changed
      ? `Files changed (${changed}), but no test, lint, typecheck, or build command was observed before completion.`
      : "Files changed, but no test, lint, typecheck, or build command was observed before completion.";
  }
  if (signal.kind === "scope_drift") {
    const changedCount = bundle.concreteFacts.changedFiles.length;
    const files = bundle.concreteFacts.changedFiles.slice(0, 5).map(formatCode).join(", ");
    return `${changedCount} files changed${files ? `, including ${files}` : ""}.`;
  }
  if (signal.kind === "file_churn") {
    const file = firstEvidencePath(signal.evidence) ?? bundle.concreteFacts.repeatedFiles[0] ?? "the same file";
    return `The same file was edited repeatedly: ${formatCode(file)}.`;
  }
  if (signal.kind === "premature_edit") {
    const file = firstEvidencePath(signal.evidence) ?? bundle.concreteFacts.changedFiles[0] ?? "a file";
    return `The first visible edit touched ${formatCode(file)} before an observed inspection or plan.`;
  }
  if (signal.kind === "environment_gap") {
    const command = firstEvidenceCommand(signal.evidence) ?? bundle.concreteFacts.failedCommands[0] ?? "a setup command";
    return `Environment probing showed failed command context around \`${command}\`.`;
  }
  return signal.summary;
}

function buildRescuePrompt(signal: SessionSignal, bundle: EvidenceBundle): string {
  if (signal.kind === "user_correction" || signal.kind === "late_constraint") {
    const text = evidenceText(signal.evidence) ?? bundle.concreteFacts.lateConstraints[0] ?? bundle.concreteFacts.userCorrections[0];
    const changed = bundle.concreteFacts.changedFiles.slice(0, 3).map(formatCode).join(", ");
    return [
      `At Turn ${signal.turnIndex}, stop editing.`,
      text ? `Preserve this constraint exactly: "${truncate(text, 220)}".` : "Preserve the constraint the user just stated.",
      changed ? `Review the files already touched (${changed}) for violations.` : "List the files changed so far that may violate it.",
      "Propose a compatibility-preserving plan before changing files again."
    ].join(" ");
  }
  if (signal.kind === "repeated_failure") {
    const command = firstEvidenceCommand(signal.evidence) ?? bundle.concreteFacts.failedCommands[0] ?? "the failing command";
    const fingerprint = bundle.concreteFacts.errorFingerprints[0];
    return [
      `At Turn ${signal.turnIndex}, stop editing.`,
      `The command \`${command}\` has failed more than once.`,
      fingerprint ? `Summarize this failure fingerprint first: ${truncate(fingerprint, 180)}.` : "Summarize the exact failing assertion first.",
      "Inspect the owning test or code path, then propose one minimal fix before editing."
    ].join(" ");
  }
  return `At Turn ${signal.turnIndex}, stop editing. Re-state the goal, list the changed files, identify missing verification, and propose the smallest next step before editing.`;
}

function buildInitialPromptClause(signal: SessionSignal, bundle: EvidenceBundle): string {
  if (signal.kind === "late_constraint") {
    const constraint = evidenceText(signal.evidence) ?? bundle.concreteFacts.lateConstraints[0] ?? "the later constraint";
    return `Include this constraint in the initial prompt: "${truncate(constraint, 220)}"`;
  }
  if (signal.kind === "scope_drift") {
    return "Make the smallest change possible, and ask before changing dependencies, configuration, or unrelated files.";
  }
  if (signal.kind === "premature_edit") {
    const file = firstEvidencePath(signal.evidence) ?? bundle.concreteFacts.changedFiles[0];
    return file
      ? `Before editing ${formatCode(file)}, inspect the relevant implementation and state the minimal plan.`
      : "Before editing, inspect the relevant implementation and state the minimal plan.";
  }
  return "Move this concrete constraint into the initial task prompt.";
}

function buildBetterInitialPrompt(bundle: EvidenceBundle, goal: { text: string; confidence: "low" | "medium" | "high" }): string {
  const lines: string[] = [];
  const latestPlanPrompt = latestFollowUpPlanPrompt(bundle);
  if (latestPlanPrompt) {
    lines.push("Implement the latest provided plan, but keep the release gate explicit and evidence-based.");
  } else if (goal.confidence === "low") {
    lines.push("The exact task is unclear from the transcript. First restate what you can infer, then ask before editing if the goal remains ambiguous.");
  } else if (/^PLEASE IMPLEMENT THIS PLAN\b/i.test(bundle.initialUserPrompt ?? "")) {
    lines.push("Implement the provided plan, but keep the release gate explicit and evidence-based.");
  } else {
    lines.push(`Task: ${summarizeInitialPrompt(bundle.initialUserPrompt)}`);
  }

  const constraints = bundle.concreteFacts.lateConstraints.slice(0, 3);
  const corrections = bundle.concreteFacts.userCorrections.slice(0, 2);
  const files = bundle.concreteFacts.changedFiles.slice(0, 4);
  const failedCommands = actionableFailedCommands(bundle).slice(0, 3);
  const verificationCommands = bundle.concreteFacts.observedTestCommands.slice(0, 3);
  const fingerprints = bundle.concreteFacts.errorFingerprints.slice(0, 2);

  if (constraints.length > 0 || corrections.length > 0 || files.length > 0 || failedCommands.length > 0) {
    lines.push("");
    lines.push("Concrete context to include up front:");
    for (const constraint of constraints) {
      lines.push(`- Constraint: "${truncate(constraint, 220)}"`);
    }
    for (const correction of corrections) {
      lines.push(`- Avoid the correction from Turn ${bundle.firsts.firstUserCorrectionTurn ?? "?"}: "${truncate(correction, 220)}"`);
    }
    for (const file of files) {
      lines.push(`- Relevant file area: ${formatCode(file)}`);
    }
    for (const command of failedCommands) {
      lines.push(`- Command that must not crash or regress: ${formatCode(command)}`);
    }
    for (const fingerprint of fingerprints) {
      lines.push(`- Failure fingerprint to address: ${truncate(fingerprint, 220)}`);
    }
  }

  lines.push("");
  lines.push("Before editing, inspect the relevant implementation and state the minimal change plan.");
  if (verificationCommands.length > 0) {
    lines.push(`Before completion, run: ${verificationCommands.map(formatCode).join(", ")}.`);
  } else if (failedCommands.length > 0) {
    lines.push(`Before completion, re-run the previously failing command: ${formatCode(failedCommands[0]!)}.`);
  } else {
    lines.push("Before completion, run the relevant verification command or explicitly state why verification was not run.");
  }

  return lines.join("\n");
}

function buildRules(bundle: EvidenceBundle): string[] {
  if (!bundle.signals.some((signal) => signal.kind === "environment_gap") || bundle.concreteFacts.packageManagers.length === 0) {
    return [];
  }
  const manager = bundle.concreteFacts.packageManagers[0]!;
  return [`Use ${manager} for this repository's setup and verification commands unless the user specifies otherwise.`];
}

function inferTitle(bundle: EvidenceBundle, goal: { text: string; confidence: "low" | "medium" | "high" }): string {
  if (goal.confidence === "low") {
    return `Low-confidence Codex session ${bundle.session.sessionId}`;
  }
  if (/^PLEASE IMPLEMENT THIS PLAN\b/i.test(bundle.initialUserPrompt ?? "")) {
    return "Implement provided plan";
  }
  return truncate(summarizeInitialPrompt(bundle.initialUserPrompt ?? `Codex session ${bundle.session.sessionId}`), 80);
}

function inferGoal(bundle: EvidenceBundle): { text: string; confidence: "low" | "medium" | "high" } {
  const latestPlanPrompt = latestFollowUpPlanPrompt(bundle);
  if (latestPlanPrompt) {
    return {
      text: [
        "This session contains multiple follow-up implementation plans, so a single session goal would be misleading.",
        `Initial visible request: ${summarizeInitialPrompt(bundle.initialUserPrompt)}`,
        `Latest visible request: ${summarizePlanPrompt(latestPlanPrompt)}`
      ].join(" "),
      confidence: "medium"
    };
  }
  if (!bundle.uncertainty.goalKnown) {
    const facts = [
      bundle.concreteFacts.changedFiles.length > 0
        ? `Codex changed ${bundle.concreteFacts.changedFiles.slice(0, 3).map(formatCode).join(", ")}.`
        : undefined,
      bundle.concreteFacts.commandsRun.length > 0
        ? `Codex ran ${bundle.concreteFacts.commandsRun.slice(0, 3).map(formatCode).join(", ")}.`
        : undefined,
      bundle.concreteFacts.userCorrections.length > 0
        ? `The user corrected direction at Turn ${bundle.firsts.firstUserCorrectionTurn}.`
        : undefined
    ].filter(Boolean);
    return {
      text: [
        "The exact goal is unclear from the available transcript.",
        facts.length > 0 ? `What is clear: ${facts.join(" ")}` : "The transcript has too little user intent to infer a specific task."
      ].join(" "),
      confidence: "low"
    };
  }
  if (/^PLEASE IMPLEMENT THIS PLAN\b/i.test(bundle.initialUserPrompt ?? "")) {
    const anchors = [
      ...bundle.concreteFacts.observedTestCommands,
      ...bundle.concreteFacts.failedCommands,
      ...bundle.concreteFacts.changedFiles
    ].slice(0, 4);
    return {
      text:
        anchors.length > 0
          ? `The user asked Codex to implement a provided plan. Concrete anchors included ${anchors.map(formatCode).join(", ")}.`
          : "The user asked Codex to implement a provided plan.",
      confidence: "medium"
    };
  }
  return {
    text: summarizeInitialPrompt(bundle.initialUserPrompt) || "The session goal was not present in the parsed transcript.",
    confidence: "medium"
  };
}

function inferOutcome(bundle: EvidenceBundle): RetroReport["session"]["outcome"] {
  if (!bundle.uncertainty.outcomeKnown) {
    return "unclear";
  }
  if (bundle.failedCommands.length > 0) {
    return "partially_successful";
  }
  if (bundle.signals.some((signal) => signal.kind === "user_correction")) {
    return "unclear";
  }
  return "successful";
}

function mapMainCause(kind: SessionSignal["kind"] | undefined): RetroReport["friction"]["mainCause"] {
  if (kind === "late_constraint" || kind === "user_correction") {
    return "late_constraint";
  }
  if (kind === "repeated_failure") {
    return "agent_loop";
  }
  if (kind === "verification_gap") {
    return "verification_gap";
  }
  if (kind === "scope_drift") {
    return "scope_drift";
  }
  if (kind === "environment_gap") {
    return "environment_gap";
  }
  return "other";
}

function whySignalMatters(signal: SessionSignal, bundle: EvidenceBundle): string {
  if (signal.kind === "late_constraint") {
    return `Putting the Turn ${signal.turnIndex} constraint in the first prompt avoids rework after edits begin.`;
  }
  if (signal.kind === "user_correction") {
    return `A rescue prompt at Turn ${signal.turnIndex} should stop edits and re-plan around the user's correction.`;
  }
  if (signal.kind === "repeated_failure") {
    const command = firstEvidenceCommand(signal.evidence) ?? bundle.concreteFacts.failedCommands[0] ?? "the failing command";
    return `Repeated \`${command}\` failures mean the next prompt should require diagnosis before another edit.`;
  }
  if (signal.kind === "verification_gap") {
    return "Completion is less trustworthy when changed files are not followed by an observed verification command.";
  }
  if (signal.kind === "scope_drift") {
    return "Scope control belongs in the initial prompt when a small request risks broad edits.";
  }
  return "Moving this concrete lesson earlier reduces wasted turns and makes the next session easier to steer.";
}

function buildChecklist(bundle: EvidenceBundle): string[] {
  const checklist = [
    "Name non-negotiable constraints in the first prompt.",
    "Ask Codex to inspect relevant files before broad edits.",
    "Require a short plan before refactors or multi-file changes."
  ];
  const verification = bundle.concreteFacts.observedTestCommands[0] ?? actionableFailedCommands(bundle)[0];
  checklist.push(
    verification
      ? `Before accepting completion, run ${formatCode(verification)} again.`
      : "Before accepting completion, ask Codex to report exactly which verification command ran."
  );
  return checklist;
}

function actionableFailedCommands(bundle: EvidenceBundle): string[] {
  return bundle.concreteFacts.failedCommands.filter((command) => isActionableFailedCommand(command));
}

function summarizeInitialPrompt(prompt: string | undefined): string {
  if (!prompt) {
    return "Complete the requested Codex task.";
  }
  const requestMatch = prompt.match(/##\s*My request for Codex:\s*([\s\S]*)/i);
  const source = requestMatch?.[1] ?? prompt;
  return truncate(redactLocalHomePaths(stripAttachmentWrapper(source).trim()) || "Complete the requested Codex task.", 500);
}

function latestFollowUpPlanPrompt(bundle: EvidenceBundle): string | undefined {
  return bundle.timeline
    .filter((item) => item.turnIndex > 1 && item.user && isImplementationPlanPrompt(item.user))
    .at(-1)?.user;
}

function summarizePlanPrompt(prompt: string): string {
  const heading = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^#\s+/.test(line) && !/^#\s*Files mentioned/i.test(line));
  return truncate(redactLocalHomePaths(heading?.replace(/^#\s+/, "") ?? "PLEASE IMPLEMENT THIS PLAN"), 220);
}

function stripAttachmentWrapper(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^#\s*Files mentioned by the user:/i.test(line))
    .filter((line) => !/^##\s+.*attachments\/.*pasted-text\.txt/i.test(line))
    .join("\n")
    .trim();
}

function redactLocalHomePaths(text: string): string {
  return text.replace(/\/Users\/[^/\s"')\]]+(?=\/)/g, "~").replace(/\/home\/[^/\s"')\]]+(?=\/)/g, "~");
}

function evidenceText(evidence: EvidenceRef[]): string | undefined {
  return evidence.find((item) => item.quote || item.summary)?.quote ?? evidence.find((item) => item.quote || item.summary)?.summary;
}

function firstEvidenceCommand(evidence: EvidenceRef[]): string | undefined {
  return evidence.find((item) => item.command)?.command;
}

function firstEvidencePath(evidence: EvidenceRef[]): string | undefined {
  return evidence.find((item) => item.path)?.path;
}

function formatCode(value: string): string {
  return `\`${value}\``;
}
