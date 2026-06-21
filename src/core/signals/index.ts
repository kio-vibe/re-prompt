import type {
  CommandExecutionEvent,
  EvidenceRef,
  NormalizedSession,
  NormalizedTurn,
  SessionSignal
} from "../types.js";
import { truncate, unique } from "../text.js";
import {
  detectPackageManager,
  fingerprintFailureOutput,
  isLikelyConstraintMessage,
  isLikelyUserCorrection,
  isVerificationCommand
} from "../commands.js";

const DONE_RE = /\b(done|fixed|implemented|complete|completed|resolved)\b|완료|수정했습니다|해결했습니다|고쳤습니다/i;
export function extractSignals(session: NormalizedSession): SessionSignal[] {
  const signals = [
    ...detectUserCorrections(session),
    ...detectLateConstraints(session),
    ...detectRepeatedFailures(session),
    ...detectVerificationGaps(session),
    ...detectScopeDrift(session),
    ...detectFileChurn(session),
    ...detectPrematureEdits(session),
    ...detectEnvironmentGap(session)
  ];

  return dedupeSignals(signals).sort((a, b) => signalPriority(a.kind) - signalPriority(b.kind));
}

function detectUserCorrections(session: NormalizedSession): SessionSignal[] {
  return session.turns.flatMap((turn) =>
    turn.userMessages
      .filter((message) => isLikelyUserCorrection(message.text))
      .map((message): SessionSignal => ({
        kind: "user_correction",
        severity: hasPriorFileChange(session, turn.index) ? "high" : "medium",
        confidence: "high",
        turnIndex: turn.index,
        title: "User corrected Codex direction",
        summary: `The user corrected the agent at Turn ${turn.index}: "${truncate(message.text, 140)}"`,
        evidence: [{ turnIndex: turn.index, eventKind: "user_message", quote: truncate(message.text, 220) }],
        suggestedActionKind: "rescue_prompt"
      }))
  );
}

function detectLateConstraints(session: NormalizedSession): SessionSignal[] {
  const initialText = session.turns[0]?.userMessages.map((message) => message.text).join("\n") ?? "";
  return session.turns
    .filter((turn) => turn.index > 1)
    .flatMap((turn) =>
      turn.userMessages
        .filter(
          (message) =>
            isLikelyConstraintMessage(message.text) &&
            !initialText.includes(message.text)
        )
        .map((message): SessionSignal => ({
          kind: "late_constraint",
          severity: hasPriorFileChange(session, turn.index) ? "high" : "medium",
          confidence: hasPriorFileChange(session, turn.index) ? "high" : "medium",
          turnIndex: turn.index,
          title: "Constraint arrived after work had started",
          summary: `A constraint appeared at Turn ${turn.index} after earlier work: "${truncate(message.text, 140)}"`,
          evidence: [
            {
              turnIndex: 1,
              eventKind: "user_message",
              summary: "Initial prompt did not include this later constraint."
            },
            { turnIndex: turn.index, eventKind: "user_message", quote: truncate(message.text, 220) }
          ],
          suggestedActionKind: "better_initial_prompt"
        }))
    );
}

function detectRepeatedFailures(session: NormalizedSession): SessionSignal[] {
  const failures = session.turns.flatMap((turn) =>
    turn.commandExecutions
      .filter((command) => command.exitCode !== undefined && command.exitCode !== 0)
      .map((command) => ({ turn, command, fingerprint: fingerprintCommandFailure(command) }))
      .filter((failure) => failure.fingerprint.length > 0)
  );
  const groups = new Map<string, typeof failures>();
  for (const failure of failures) {
    const existing = groups.get(failure.fingerprint) ?? [];
    existing.push(failure);
    groups.set(failure.fingerprint, existing);
  }

  return [...groups.values()]
    .filter((group) => group.length >= 2)
    .map((group): SessionSignal => {
      const first = group[0]!;
      return {
        kind: "repeated_failure",
        severity: group.length >= 3 ? "high" : "medium",
        confidence: "high",
        turnIndex: first.turn.index,
        title: "Same command failure repeated",
        summary: `The same failure pattern appeared ${group.length} times for "${first.command.command}".`,
        evidence: group.slice(0, 3).map((failure) => ({
          turnIndex: failure.turn.index,
          eventKind: "command",
          command: failure.command.command,
          summary: truncate(failure.command.stdoutPreview ?? failure.command.stderrPreview ?? "", 220)
        })),
        suggestedActionKind: "rescue_prompt"
      };
    });
}

function detectVerificationGaps(session: NormalizedSession): SessionSignal[] {
  const changed = session.turns.some((turn) => turn.fileChanges.length > 0);
  if (!changed) {
    return [];
  }
  const hasVerification = session.turns.some((turn) =>
    turn.commandExecutions.some((command) => isVerificationCommand(command.command))
  );
  const lastAssistant = session.turns
    .flatMap((turn) => turn.assistantMessages.map((message) => ({ turn, message })))
    .at(-1);
  if (!lastAssistant || !DONE_RE.test(lastAssistant.message.text) || hasVerification) {
    return [];
  }
  return [
    {
      kind: "verification_gap",
      severity: "high",
      confidence: "high",
      turnIndex: lastAssistant.turn.index,
      title: "Completion claimed without verification",
      summary: "Files changed and the assistant claimed completion, but no test, lint, typecheck, or build command was observed.",
      evidence: [
        {
          turnIndex: lastAssistant.turn.index,
          eventKind: "assistant_message",
          quote: truncate(lastAssistant.message.text, 220)
        }
      ],
      suggestedActionKind: "workflow_change"
    }
  ];
}

function detectScopeDrift(session: NormalizedSession): SessionSignal[] {
  const firstPrompt = session.turns[0]?.userMessages.map((message) => message.text).join("\n") ?? "";
  const changedPaths = unique(session.turns.flatMap((turn) => turn.fileChanges.map((change) => change.path)));
  const asksSmall = /\b(small|minimal|tiny|just|only|bugfix|bug fix)\b|작게|간단|버그/i.test(firstPrompt);
  const dependencyChange = changedPaths.some((path) => /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(path));
  if (!asksSmall || (changedPaths.length < 8 && !dependencyChange)) {
    return [];
  }
  return [
    {
      kind: "scope_drift",
      severity: "high",
      confidence: "medium",
      turnIndex: 1,
      title: "Small request grew into broad file changes",
      summary: `The initial request sounded small, but ${changedPaths.length} files changed${dependencyChange ? " including dependency metadata" : ""}.`,
      evidence: [
        { turnIndex: 1, eventKind: "user_message", quote: truncate(firstPrompt, 220) },
        {
          turnIndex: 1,
          eventKind: "file_change",
          summary: changedPaths.slice(0, 10).join(", ")
        }
      ],
      suggestedActionKind: "better_initial_prompt"
    }
  ];
}

function detectFileChurn(session: NormalizedSession): SessionSignal[] {
  const counts = new Map<string, { count: number; firstTurn: number; lastTurn: number }>();
  for (const turn of session.turns) {
    for (const change of turn.fileChanges) {
      const existing = counts.get(change.path) ?? { count: 0, firstTurn: turn.index, lastTurn: turn.index };
      existing.count += 1;
      existing.lastTurn = turn.index;
      counts.set(change.path, existing);
    }
  }
  return [...counts.entries()]
    .filter(([, value]) => value.count >= 3)
    .map(([path, value]): SessionSignal => ({
      kind: "file_churn",
      severity: "medium",
      confidence: "medium",
      turnIndex: value.firstTurn,
      title: "Repeated file edits",
      summary: `${path} was changed ${value.count} times from Turn ${value.firstTurn} to Turn ${value.lastTurn}.`,
      evidence: [{ turnIndex: value.firstTurn, eventKind: "file_change", path }],
      suggestedActionKind: "rescue_prompt"
    }));
}

function detectPrematureEdits(session: NormalizedSession): SessionSignal[] {
  const firstFileTurn = session.turns.find((turn) => turn.fileChanges.length > 0);
  if (!firstFileTurn) {
    return [];
  }
  const hadInspectBefore = session.turns
    .filter((turn) => turn.index <= firstFileTurn.index)
    .some((turn) => turn.commandExecutions.some((command) => /\b(sed|rg|ls|find|cat|git diff|git status)\b/.test(command.command)));
  const hadPlanBefore = session.turns
    .filter((turn) => turn.index <= firstFileTurn.index)
    .some((turn) => turn.planUpdates.length > 0 || turn.assistantMessages.some((message) => /\bplan|inspect|먼저|계획/i.test(message.text)));
  if (hadInspectBefore || hadPlanBefore) {
    return [];
  }
  return [
    {
      kind: "premature_edit",
      severity: "medium",
      confidence: "medium",
      turnIndex: firstFileTurn.index,
      title: "Files changed before visible inspection or planning",
      summary: "The first file edit happened before an observed inspection command or planning message.",
      evidence: firstFileTurn.fileChanges.slice(0, 3).map((change) => ({
        turnIndex: firstFileTurn.index,
        eventKind: "file_change",
        path: change.path
      })),
      suggestedActionKind: "workflow_change"
    }
  ];
}

function detectEnvironmentGap(session: NormalizedSession): SessionSignal[] {
  const failedEnvCommands = session.turns.flatMap((turn) =>
    turn.commandExecutions
      .filter((command) => command.exitCode !== undefined && command.exitCode !== 0 && Boolean(detectPackageManager(command.command)))
      .map((command) => ({ turn, command }))
  );
  if (failedEnvCommands.length < 2) {
    return [];
  }
  const first = failedEnvCommands[0]!;
  return [
    {
      kind: "environment_gap",
      severity: "medium",
      confidence: "medium",
      turnIndex: first.turn.index,
      title: "Environment probing consumed failed commands",
      summary: "Multiple package or runtime commands failed, suggesting missing setup context.",
      evidence: failedEnvCommands.slice(0, 3).map((failure) => ({
        turnIndex: failure.turn.index,
        eventKind: "command",
        command: failure.command.command,
        summary: truncate(failure.command.stdoutPreview ?? "", 180)
      })),
      suggestedActionKind: "agents_md_rule"
    }
  ];
}

function hasPriorFileChange(session: NormalizedSession, turnIndex: number): boolean {
  return session.turns.some((turn) => turn.index < turnIndex && turn.fileChanges.length > 0);
}

function fingerprintCommandFailure(command: CommandExecutionEvent): string {
  return fingerprintFailureOutput(command.stderrPreview || command.stdoutPreview || "");
}

function dedupeSignals(signals: SessionSignal[]): SessionSignal[] {
  const seen = new Set<string>();
  return signals.filter((signal) => {
    const key = `${signal.kind}:${signal.turnIndex}:${signal.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function signalPriority(kind: SessionSignal["kind"]): number {
  const order: Record<SessionSignal["kind"], number> = {
    late_constraint: 1,
    repeated_failure: 2,
    user_correction: 3,
    verification_gap: 4,
    scope_drift: 5,
    file_churn: 6,
    premature_edit: 7,
    environment_gap: 8
  };
  return order[kind];
}
