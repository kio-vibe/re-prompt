import { buildPromptCoachBundle } from "../coach/buildPromptCoachBundle.js";
import type { EvidenceBundle, NormalizedSession, PromptHabitBundle, SessionSignal } from "../types.js";

export interface PromptHabitSessionInput {
  session: NormalizedSession;
  signals: SessionSignal[];
  evidence: EvidenceBundle;
  score: number;
  mainIssue: string;
  chatSummary: string;
  startedAt?: string;
}

export function buildPromptHabitBundle(
  inputs: PromptHabitSessionInput[],
  options: {
    language: "auto" | "en" | "ko";
    sessionsSkipped?: number;
  }
): PromptHabitBundle {
  const sessions = inputs.map((input) => ({
    source: "codex" as const,
    sessionId: input.session.sessionId,
    startedAt: input.session.startedAt ?? input.startedAt,
    turnCount: input.session.turns.length,
    score: input.score,
    mainIssue: input.mainIssue,
    chatSummary: input.chatSummary
  }));

  const userMessages = selectHabitMessages(
    inputs.flatMap((input) => {
      const coachBundle = buildPromptCoachBundle(input.session, input.evidence, { language: options.language });
      return coachBundle.userMessages.map((message) => ({
        sessionId: input.session.sessionId,
        turnIndex: message.turnIndex,
        kind: message.kind,
        text: message.text,
        whyIncluded: message.whyIncluded
      }));
    })
  );

  const signals = inputs.flatMap((input) =>
    input.signals.slice(0, 8).map((signal) => ({
      sessionId: input.session.sessionId,
      turnIndex: signal.turnIndex,
      kind: signal.kind,
      title: signal.summary,
      confidence: signal.confidence
    }))
  );

  return {
    product: "re-prompt",
    bundleVersion: 1,
    language: options.language,
    sessions,
    userMessages,
    evidence: {
      signals,
      lateConstraints: uniqueFlatMap(inputs, (input) => input.evidence.concreteFacts.lateConstraints),
      userCorrections: uniqueFlatMap(inputs, (input) => input.evidence.concreteFacts.userCorrections),
      observedTestCommands: uniqueFlatMap(inputs, (input) => input.evidence.concreteFacts.observedTestCommands),
      repeatedFiles: uniqueFlatMap(inputs, (input) => input.evidence.concreteFacts.repeatedFiles),
      uncertainty: {
        sessionsAnalyzed: inputs.length,
        sessionsSkipped: options.sessionsSkipped ?? 0,
        reason:
          inputs.length === 0
            ? "No analyzable Codex sessions were available for habit analysis."
            : undefined
      }
    },
    privacy: {
      redactionApplied: false,
      redactionCount: 0
    }
  };
}

function selectHabitMessages(
  messages: PromptHabitBundle["userMessages"],
  maxMessages = 80
): PromptHabitBundle["userMessages"] {
  const selected = new Map<string, PromptHabitBundle["userMessages"][number]>();
  const add = (message: PromptHabitBundle["userMessages"][number]) => {
    selected.set(`${message.sessionId}:${message.turnIndex}:${message.kind}:${message.text.slice(0, 32)}`, message);
  };

  for (const message of messages.filter((message) => message.kind === "initial")) {
    add(message);
  }
  for (const message of messages.filter((message) => message.kind === "correction" || message.kind === "late_constraint")) {
    add(message);
  }
  for (const message of messages.filter((message) => message.kind === "rescue_worthy")) {
    add(message);
  }
  for (const message of messages) {
    if (selected.size >= maxMessages) {
      break;
    }
    add(message);
  }

  return [...selected.values()].slice(0, maxMessages);
}

function uniqueFlatMap(
  inputs: PromptHabitSessionInput[],
  getValues: (input: PromptHabitSessionInput) => string[]
): string[] {
  const values = new Set<string>();
  for (const input of inputs) {
    for (const value of getValues(input)) {
      const trimmed = sanitizeEvidenceText(value).trim();
      if (trimmed) {
        values.add(trimmed);
      }
    }
  }
  return [...values].slice(0, 24);
}

function sanitizeEvidenceText(text: string): string {
  return text
    .replace(/<details>[\s\S]*?<\/details>/gi, "")
    .replace(/<summary>[\s\S]*?<\/summary>/gi, "")
    .replace(/<details[\s\S]*$/gi, "")
    .replace(/<\/?(details|summary)>/gi, "")
    .replace(/```[\s\S]*?```/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith(">"))
    .filter((line) => !/^\[\$re-prompt/i.test(line))
    .filter((line) => !/^#\s*(Start re-prompt flow|Run re-prompt go|re-prompt-go 분석|Review Codex session)/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ");
}
