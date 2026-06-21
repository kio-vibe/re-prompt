import type { EvidenceAnchor, EvidenceBundle, NormalizedSession, SessionSignal } from "../types.js";
import { truncate, unique } from "../text.js";
import {
  detectPackageManager,
  fingerprintFailureOutput,
  isLikelyConstraintMessage,
  isLikelyUserCorrection,
  isVerificationCommand
} from "../commands.js";

export function buildEvidenceBundle(session: NormalizedSession, signals: SessionSignal[]): EvidenceBundle {
  const fileStats = new Map<string, { changeCount: number; firstTurn: number; lastTurn: number }>();
  const failedCommands: EvidenceBundle["failedCommands"] = [];
  const anchors: EvidenceAnchor[] = [];
  const commandsRun: string[] = [];
  const observedTestCommands: string[] = [];
  const packageManagers: string[] = [];
  const errorFingerprints: string[] = [];
  let firstEditTurn: number | undefined;
  let firstFailedCommandTurn: number | undefined;
  let firstVerificationCommandTurn: number | undefined;

  for (const turn of session.turns) {
    for (const change of turn.fileChanges) {
      firstEditTurn ??= turn.index;
      const existing = fileStats.get(change.path) ?? {
        changeCount: 0,
        firstTurn: turn.index,
        lastTurn: turn.index
      };
      existing.changeCount += 1;
      existing.lastTurn = turn.index;
      fileStats.set(change.path, existing);
      anchors.push({ kind: "changed_file", value: change.path, turnIndex: turn.index, confidence: "high" });
    }

    for (const command of turn.commandExecutions) {
      commandsRun.push(command.command);
      anchors.push({ kind: "command", value: command.command, turnIndex: turn.index, confidence: "high" });
      const packageManager = detectPackageManager(command.command);
      if (packageManager) {
        packageManagers.push(packageManager);
        anchors.push({ kind: "package_manager", value: packageManager, turnIndex: turn.index, confidence: "medium" });
      }
      if (isVerificationCommand(command.command)) {
        firstVerificationCommandTurn ??= turn.index;
        observedTestCommands.push(command.command);
        anchors.push({ kind: "verification_command", value: command.command, turnIndex: turn.index, confidence: "high" });
      }
      if (command.exitCode !== undefined && command.exitCode !== 0) {
        firstFailedCommandTurn ??= turn.index;
        const fingerprint = fingerprintFailureOutput(command.stderrPreview ?? command.stdoutPreview ?? "");
        if (fingerprint) {
          errorFingerprints.push(fingerprint);
          anchors.push({ kind: "error_fingerprint", value: fingerprint, turnIndex: turn.index, confidence: "medium" });
        }
        anchors.push({ kind: "failed_command", value: command.command, turnIndex: turn.index, confidence: "high" });
        failedCommands.push({
          turnIndex: turn.index,
          command: command.command,
          exitCode: command.exitCode,
          stderrPreview: truncate(command.stderrPreview ?? command.stdoutPreview ?? "", 500)
        });
      }
    }
  }

  const changedFiles = [...fileStats.entries()].map(([path, stats]) => ({ path, ...stats }));
  const userCorrections = session.turns.flatMap((turn) =>
    turn.userMessages
      .filter((message) => isLikelyUserCorrection(message.text))
      .map((message) => ({ turnIndex: turn.index, text: truncate(message.text, 500) }))
  );
  const constraints = session.turns.flatMap((turn) =>
    turn.userMessages
      .filter((message) => isLikelyConstraintMessage(message.text))
      .map((message) => ({ turnIndex: turn.index, text: truncate(message.text, 500), late: turn.index > 1 }))
  );
  for (const correction of userCorrections) {
    anchors.push({ kind: "user_correction", value: correction.text, turnIndex: correction.turnIndex, confidence: "high" });
  }
  for (const constraint of constraints.filter((item) => item.late)) {
    anchors.push({ kind: "late_constraint", value: constraint.text, turnIndex: constraint.turnIndex, confidence: "high" });
  }

  const firstUserCorrectionTurn = userCorrections[0]?.turnIndex;
  const firstLateConstraintTurn = constraints.find((constraint) => constraint.late)?.turnIndex;
  const repeatedFiles = changedFiles.filter((file) => file.changeCount >= 2).map((file) => file.path);
  const verificationKnown = observedTestCommands.length > 0;
  const goalKnown = isGoalKnown(session.turns[0]?.userMessages[0]?.text, {
    changedFiles: changedFiles.map((file) => file.path),
    commandsRun
  });
  const hasVerificationGap = signals.some((signal) => signal.kind === "verification_gap");
  const outcomeKnown = failedCommands.length > 0 || (!hasVerificationGap && verificationKnown);

  return {
    product: "re-prompt",
    bundleVersion: 1,
    session: {
      source: "codex",
      sessionId: session.sessionId,
      transcriptPath: session.transcriptPath,
      cwd: session.cwd,
      repoRoot: session.repoRoot,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      turnCount: session.turns.length,
      changedFileCount: changedFiles.length,
      failedCommandCount: failedCommands.length
    },
    initialUserPrompt: session.turns[0]?.userMessages[0]?.text,
    timeline: session.turns.map((turn) => ({
      turnIndex: turn.index,
      user: truncate(turn.userMessages.map((message) => message.text).join("\n"), 400) || undefined,
      assistantSummary: truncate(turn.assistantMessages.at(-1)?.text ?? "", 300) || undefined,
      commands: turn.commandExecutions.map((command) => command.command),
      fileChanges: turn.fileChanges.map((change) => change.path),
      notable: signals.filter((signal) => signal.turnIndex === turn.index).map((signal) => signal.title)
    })),
    signals,
    changedFiles,
    failedCommands,
    userCorrections,
    constraints,
    anchors: dedupeAnchors(anchors),
    expensiveWindow: buildExpensiveWindow(signals),
    firsts: {
      firstEditTurn,
      firstFailedCommandTurn,
      firstUserCorrectionTurn,
      firstLateConstraintTurn,
      firstVerificationCommandTurn
    },
    concreteFacts: {
      changedFiles: changedFiles.map((file) => file.path),
      repeatedFiles,
      commandsRun: unique(commandsRun),
      failedCommands: unique(failedCommands.map((command) => command.command)),
      observedTestCommands: unique(observedTestCommands),
      packageManagers: unique(packageManagers),
      lateConstraints: constraints.filter((constraint) => constraint.late).map((constraint) => constraint.text),
      userCorrections: userCorrections.map((correction) => correction.text),
      errorFingerprints: unique(errorFingerprints)
    },
    uncertainty: {
      goalKnown,
      outcomeKnown,
      verificationKnown,
      reason: goalKnown ? undefined : "The initial user prompt did not contain enough concrete task detail."
    },
    privacy: {
      redactionApplied: false,
      redactionCount: 0
    }
  };
}

function buildExpensiveWindow(signals: SessionSignal[]): EvidenceBundle["expensiveWindow"] {
  if (signals.length === 0) {
    return undefined;
  }
  const first = signals[0]!;
  const last = signals[signals.length - 1]!;
  return {
    startTurn: first.turnIndex,
    endTurn: last.turnIndex,
    reason: first.title,
    confidence: first.confidence
  };
}

function dedupeAnchors(anchors: EvidenceAnchor[]): EvidenceAnchor[] {
  const seen = new Set<string>();
  return anchors.filter((anchor) => {
    const key = `${anchor.kind}:${anchor.turnIndex ?? ""}:${anchor.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isGoalKnown(
  initialPrompt: string | undefined,
  facts: { changedFiles: string[]; commandsRun: string[] }
): boolean {
  if (!initialPrompt || initialPrompt.trim().length < 20) {
    return false;
  }
  const normalized = initialPrompt.trim().toLowerCase();
  const hasConcretePromptAnchor = /`[^`]+`|[\w./-]+\.(ts|tsx|js|jsx|json|md|py|go|rs)|\b(pnpm|npm|yarn|node|pytest|cargo|go)\b/i.test(
    initialPrompt
  );
  if (hasConcretePromptAnchor) {
    return true;
  }
  if (/^(do it|fix it|handle it|make it work|please implement this plan)\.?$/i.test(normalized)) {
    return false;
  }
  return initialPrompt.trim().split(/\s+/).length >= 4 || facts.commandsRun.length > 0;
}
