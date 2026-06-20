import type { NormalizedSession, SessionSignal, SignalKind } from "../types.js";

export function computeFrictionScore(session: NormalizedSession, signals: SessionSignal[]): number {
  const turnCountScore = Math.min(session.turns.length * 1.5, 25);
  const failedCommandScore =
    session.turns.flatMap((turn) => turn.commandExecutions).filter((command) => command.exitCode !== undefined && command.exitCode !== 0)
      .length * 5;
  const score =
    turnCountScore +
    failedCommandScore +
    count(signals, "user_correction") * 10 +
    count(signals, "late_constraint") * 12 +
    count(signals, "repeated_failure") * 14 +
    count(signals, "verification_gap") * 8 +
    count(signals, "scope_drift") * 10 +
    count(signals, "file_churn") * 8 +
    count(signals, "premature_edit") * 7 +
    count(signals, "environment_gap") * 6 +
    (session.rawStats.parseErrorCount > 0 ? 3 : 0);

  return Math.min(100, Math.round(score));
}

export function frictionLabel(score: number): "low" | "medium" | "high" | "severe" {
  if (score >= 80) {
    return "severe";
  }
  if (score >= 55) {
    return "high";
  }
  if (score >= 30) {
    return "medium";
  }
  return "low";
}

function count(signals: SessionSignal[], kind: SignalKind): number {
  return signals.filter((signal) => signal.kind === kind).length;
}
