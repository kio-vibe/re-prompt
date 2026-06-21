export type SourceKind = "codex";
export type Engine = "none" | "codex" | "claude";

export interface ParseError {
  lineNumber: number;
  preview: string;
  message: string;
}

export interface UnknownEventPreview {
  lineNumber: number;
  type: string;
  preview: string;
}

export interface ParsedCodexEvent {
  lineNumber: number;
  timestamp?: string;
  type: string;
  payload: unknown;
  raw: Record<string, unknown>;
}

export interface ParsedCodexTranscript {
  events: ParsedCodexEvent[];
  errors: ParseError[];
  unknownEvents: UnknownEventPreview[];
  stats: {
    rawLineCount: number;
    parseErrorCount: number;
    unknownEventCount: number;
  };
}

export interface NormalizedSession {
  source: SourceKind;
  sessionId: string;
  transcriptPath: string;
  cwd?: string;
  repoRoot?: string;
  startedAt?: string;
  endedAt?: string;
  model?: string;
  turns: NormalizedTurn[];
  usage?: SessionUsage;
  rawStats: {
    rawLineCount: number;
    parseErrorCount: number;
    unknownEventCount: number;
  };
}

export interface NormalizedTurn {
  index: number;
  turnId?: string;
  startedAt?: string;
  completedAt?: string;
  failed?: boolean;
  userMessages: UserMessage[];
  assistantMessages: AssistantMessage[];
  toolEvents: ToolEvent[];
  fileChanges: FileChangeEvent[];
  commandExecutions: CommandExecutionEvent[];
  planUpdates: PlanUpdateEvent[];
  usage?: TurnUsage;
}

export interface UserMessage {
  text: string;
  timestamp?: string;
}

export interface AssistantMessage {
  text: string;
  timestamp?: string;
  kind?: "final" | "intermediate" | "review" | "unknown";
}

export interface ToolEvent {
  toolName: string;
  callId?: string;
  inputPreview?: string;
  outputPreview?: string;
  timestamp?: string;
}

export interface CommandExecutionEvent {
  command: string;
  exitCode?: number;
  stdoutPreview?: string;
  stderrPreview?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface FileChangeEvent {
  path: string;
  changeKind: "created" | "modified" | "deleted" | "renamed" | "unknown";
  diffPreview?: string;
  turnIndex?: number;
}

export interface PlanUpdateEvent {
  text: string;
}

export interface SessionUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface TurnUsage extends SessionUsage {}

export type SignalKind =
  | "user_correction"
  | "late_constraint"
  | "repeated_failure"
  | "verification_gap"
  | "scope_drift"
  | "file_churn"
  | "premature_edit"
  | "environment_gap";

export interface SessionSignal {
  kind: SignalKind;
  severity: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  turnIndex: number;
  title: string;
  summary: string;
  evidence: EvidenceRef[];
  suggestedActionKind:
    | "better_initial_prompt"
    | "rescue_prompt"
    | "agents_md_rule"
    | "workflow_change"
    | "ignore";
}

export interface EvidenceRef {
  turnIndex: number;
  eventKind:
    | "user_message"
    | "assistant_message"
    | "command"
    | "file_change"
    | "plan_update"
    | "usage"
    | "parser_note";
  quote?: string;
  summary?: string;
  path?: string;
  command?: string;
}

export interface EvidenceAnchor {
  kind:
    | "file_path"
    | "command"
    | "failed_command"
    | "error_fingerprint"
    | "late_constraint"
    | "user_correction"
    | "verification_command"
    | "changed_file"
    | "package_manager";
  value: string;
  turnIndex?: number;
  confidence: "low" | "medium" | "high";
}

export interface TimelineItem {
  turnIndex: number;
  user?: string;
  assistantSummary?: string;
  commands?: string[];
  fileChanges?: string[];
  notable?: string[];
}

export interface EvidenceBundle {
  product: "re-prompt";
  bundleVersion: 1;
  session: {
    source: "codex";
    sessionId: string;
    transcriptPath: string;
    cwd?: string;
    repoRoot?: string;
    startedAt?: string;
    endedAt?: string;
    turnCount: number;
    changedFileCount: number;
    failedCommandCount: number;
  };
  initialUserPrompt?: string;
  timeline: TimelineItem[];
  signals: SessionSignal[];
  changedFiles: {
    path: string;
    changeCount: number;
    firstTurn: number;
    lastTurn: number;
  }[];
  failedCommands: {
    turnIndex: number;
    command: string;
    exitCode?: number;
    stderrPreview?: string;
  }[];
  userCorrections: {
    turnIndex: number;
    text: string;
  }[];
  constraints: {
    turnIndex: number;
    text: string;
    late: boolean;
  }[];
  anchors: EvidenceAnchor[];
  expensiveWindow?: {
    startTurn: number;
    endTurn: number;
    reason: string;
    confidence: "low" | "medium" | "high";
  };
  firsts: {
    firstEditTurn?: number;
    firstFailedCommandTurn?: number;
    firstUserCorrectionTurn?: number;
    firstLateConstraintTurn?: number;
    firstVerificationCommandTurn?: number;
  };
  concreteFacts: {
    changedFiles: string[];
    repeatedFiles: string[];
    commandsRun: string[];
    failedCommands: string[];
    observedTestCommands: string[];
    packageManagers: string[];
    lateConstraints: string[];
    userCorrections: string[];
    errorFingerprints: string[];
  };
  uncertainty: {
    goalKnown: boolean;
    outcomeKnown: boolean;
    verificationKnown: boolean;
    reason?: string;
  };
  privacy: {
    redactionApplied: boolean;
    redactionCount: number;
  };
}

export interface RetroReport {
  schemaVersion: 1;
  analysis?: {
    requestedEngine: Engine;
    usedEngine: Engine;
    fallback: boolean;
    fallbackReason?: string;
  };
  session: {
    source: "codex";
    sessionId: string;
    title: string;
    inferredGoal: string;
    outcome: "successful" | "partially_successful" | "failed" | "unclear";
    confidence: "low" | "medium" | "high";
  };
  selection?: {
    command: "last" | "retro";
    source: "codex";
    sessionId: string;
    transcriptPath: string;
    selectedBecause: string;
    startedAt?: string;
    turnsAnalyzed: number;
    skippedNewerSessions?: {
      tooLarge: number;
      parseFailed: number;
      other: number;
    };
    confidence: "low" | "medium" | "high";
    confidenceReason?: string;
  };
  executiveSummary: string;
  friction: {
    score: number;
    label: "low" | "medium" | "high" | "severe";
    mainCause:
      | "missing_context"
      | "late_constraint"
      | "unclear_acceptance_criteria"
      | "environment_gap"
      | "scope_drift"
      | "verification_gap"
      | "agent_loop"
      | "other";
  };
  turningPoints: TurningPoint[];
  findings: Finding[];
  betterInitialPrompt: {
    prompt: string;
    whyThisWouldHelp: string;
    confidence: "low" | "medium" | "high";
  };
  rescuePrompts: RescuePrompt[];
  agentsMdPatch: {
    shouldPatch: boolean;
    target: "global" | "repo" | "subdir" | "none";
    rationale: string;
    patchMarkdown: string;
    rules: string[];
  };
  nextSessionChecklist: string[];
  limitations: string[];
}

export interface TurningPoint {
  turnIndex: number;
  title: string;
  whatHappened: string;
  whyItMattered: string;
  evidence: EvidenceRef[];
}

export interface Finding {
  id: string;
  title: string;
  severity: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  diagnosis: string;
  evidence: EvidenceRef[];
  betterBehavior: string;
  suggestedFix:
    | { kind: "initial_prompt"; text: string }
    | { kind: "rescue_prompt"; turnIndex: number; text: string }
    | { kind: "agents_md_rule"; text: string }
    | { kind: "workflow"; text: string };
}

export interface RescuePrompt {
  turnIndex: number;
  prompt: string;
  useWhen: string;
  expectedEffect: string;
  confidence: "low" | "medium" | "high";
}
