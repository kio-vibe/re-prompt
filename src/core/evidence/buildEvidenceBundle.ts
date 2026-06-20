import type { EvidenceBundle, NormalizedSession, SessionSignal } from "../types.js";
import { truncate } from "../text.js";

const CONSTRAINT_RE = /\b(must|don't|without|preserve|keep|maintain|never|do not)\b|기존|유지|바꾸지|건드리지/i;
const CORRECTION_RE = /\b(no|wrong|stop|revert|rollback|don't change|that's not)\b|아니|그게 아니라|틀렸|잘못|멈춰|되돌려/i;

export function buildEvidenceBundle(session: NormalizedSession, signals: SessionSignal[]): EvidenceBundle {
  const fileStats = new Map<string, { changeCount: number; firstTurn: number; lastTurn: number }>();
  const failedCommands: EvidenceBundle["failedCommands"] = [];

  for (const turn of session.turns) {
    for (const change of turn.fileChanges) {
      const existing = fileStats.get(change.path) ?? {
        changeCount: 0,
        firstTurn: turn.index,
        lastTurn: turn.index
      };
      existing.changeCount += 1;
      existing.lastTurn = turn.index;
      fileStats.set(change.path, existing);
    }

    for (const command of turn.commandExecutions) {
      if (command.exitCode !== undefined && command.exitCode !== 0) {
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
    userCorrections: session.turns.flatMap((turn) =>
      turn.userMessages
        .filter((message) => CORRECTION_RE.test(message.text))
        .map((message) => ({ turnIndex: turn.index, text: truncate(message.text, 500) }))
    ),
    constraints: session.turns.flatMap((turn) =>
      turn.userMessages
        .filter((message) => CONSTRAINT_RE.test(message.text))
        .map((message) => ({ turnIndex: turn.index, text: truncate(message.text, 500), late: turn.index > 1 }))
    ),
    privacy: {
      redactionApplied: false,
      redactionCount: 0
    }
  };
}
