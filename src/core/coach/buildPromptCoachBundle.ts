import { isLikelyConstraintMessage, isLikelyUserCorrection } from "../commands.js";
import { truncate } from "../text.js";
import type { EvidenceBundle, NormalizedSession, PromptCoachBundle, SessionSignal } from "../types.js";

type CoachMessageKind = PromptCoachBundle["userMessages"][number]["kind"];

export function buildPromptCoachBundle(
  session: NormalizedSession,
  evidence: EvidenceBundle,
  options: { language: "auto" | "en" | "ko" }
): PromptCoachBundle {
  const signalTurns = new Set(evidence.signals.map((signal) => signal.turnIndex));
  const allMessages = session.turns.flatMap((turn) =>
    turn.userMessages.map((message, messageIndex) => {
      const kind = classifyUserMessage(turn.index, messageIndex, message.text, signalTurns);
      return {
        turnIndex: turn.index,
        kind,
        text: sanitizeUserText(message.text),
        whyIncluded: whyIncluded(kind)
      };
    })
  );
  const userMessages = selectCoachMessages(allMessages, signalTurns);

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
      turnCount: session.turns.length
    },
    language: options.language,
    userMessages,
    evidence: {
      signals: evidence.signals,
      anchors: evidence.anchors,
      changedFiles: evidence.concreteFacts.changedFiles,
      repeatedFiles: evidence.concreteFacts.repeatedFiles,
      observedTestCommands: evidence.concreteFacts.observedTestCommands,
      failedCommands: evidence.concreteFacts.failedCommands,
      lateConstraints: evidence.concreteFacts.lateConstraints.map(sanitizeEvidenceText),
      userCorrections: evidence.concreteFacts.userCorrections.map(sanitizeEvidenceText),
      uncertainty: evidence.uncertainty
    },
    privacy: {
      redactionApplied: false,
      redactionCount: 0
    }
  };
}

function classifyUserMessage(
  turnIndex: number,
  messageIndex: number,
  text: string,
  signalTurns: Set<number>
): CoachMessageKind {
  if (turnIndex === 1 && messageIndex === 0) {
    return "initial";
  }
  if (isLikelyUserCorrection(text)) {
    return "correction";
  }
  if (turnIndex > 1 && isLikelyConstraintMessage(text)) {
    return "late_constraint";
  }
  if (signalTurns.has(turnIndex)) {
    return "rescue_worthy";
  }
  return "follow_up";
}

function whyIncluded(kind: CoachMessageKind): string {
  switch (kind) {
    case "initial":
      return "Initial user prompt.";
    case "correction":
      return "User correction or redirect.";
    case "late_constraint":
      return "Constraint introduced after the session started.";
    case "rescue_worthy":
      return "Same turn as a high-friction signal.";
    case "follow_up":
      return "User follow-up message.";
  }
}

function sanitizeUserText(text: string): string {
  const request = extractVisibleUserRequest(text);
  const withoutDetails = request.replace(/<details>[\s\S]*?<\/details>/gi, "").replace(/<details>[\s\S]*/gi, "");
  const withoutQuotedTooling = withoutDetails
    .split(/\r?\n/)
    .filter((line) => !/^>\s*/.test(line.trim()))
    .filter((line) => !/^#\s*Files mentioned by the user:/i.test(line.trim()))
    .filter((line) => !/^#\s*(Start re-prompt flow|Run re-prompt go)\s*$/i.test(line.trim()))
    .filter((line) => !/^##\s+.*(?:attachments|\.codex|pasted-text|\.png|\.txt)/i.test(line.trim()))
    .join("\n");
  const compact = withoutQuotedTooling.replace(/```[\s\S]*?```/g, (match) =>
    match.length > 500 ? "[redacted long code block]" : match
  );
  return truncate(compact.trim().replace(/\n{3,}/g, "\n\n"), 700);
}

function sanitizeEvidenceText(text: string): string {
  return truncate(sanitizeUserText(text), 360);
}

function extractVisibleUserRequest(text: string): string {
  const requestMatch = text.match(/##\s*My request for Codex:\s*([\s\S]*)/i);
  return requestMatch?.[1] ?? text;
}

function selectCoachMessages(
  messages: PromptCoachBundle["userMessages"],
  signalTurns: Set<number>
): PromptCoachBundle["userMessages"] {
  if (messages.length <= 40) {
    return messages;
  }
  const selected = new Map<string, PromptCoachBundle["userMessages"][number]>();
  const add = (message: PromptCoachBundle["userMessages"][number]) => {
    selected.set(`${message.turnIndex}:${message.kind}:${message.text}`, message);
  };

  for (const message of messages.slice(0, 8)) {
    add(message);
  }
  for (const message of messages.slice(-8)) {
    add(message);
  }
  for (const message of messages) {
    if (message.kind !== "follow_up" || signalTurns.has(message.turnIndex)) {
      add(message);
    }
  }

  return [...selected.values()].sort((left, right) => left.turnIndex - right.turnIndex).slice(0, 60);
}
