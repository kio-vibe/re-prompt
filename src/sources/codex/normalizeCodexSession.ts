import type {
  CommandExecutionEvent,
  FileChangeEvent,
  NormalizedSession,
  NormalizedTurn,
  ParsedCodexEvent,
  ParsedCodexTranscript,
  ToolEvent
} from "../../core/types.js";
import { asString, contentToText, getObject, truncate } from "../../core/text.js";

export interface CodexSessionMeta {
  transcriptPath: string;
}

interface PendingCommand extends CommandExecutionEvent {
  callId: string;
}

interface PendingPatch {
  callId: string;
  input?: string;
  paths: string[];
}

export function normalizeCodexSession(
  parsed: ParsedCodexTranscript,
  meta: CodexSessionMeta
): NormalizedSession {
  const builder = new SessionBuilder(parsed, meta);

  for (const event of parsed.events) {
    builder.add(event);
  }

  return builder.build();
}

class SessionBuilder {
  private sessionId = "unknown-session";
  private cwd: string | undefined;
  private startedAt: string | undefined;
  private endedAt: string | undefined;
  private model: string | undefined;
  private readonly turns: NormalizedTurn[] = [];
  private currentTurn: NormalizedTurn | undefined;
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly pendingPatches = new Map<string, PendingPatch>();

  public constructor(
    private readonly parsed: ParsedCodexTranscript,
    private readonly meta: CodexSessionMeta
  ) {}

  public add(event: ParsedCodexEvent): void {
    const payload = getObject(event.payload);
    if (event.type === "session_meta") {
      this.sessionId = asString(payload?.id) ?? this.sessionId;
      this.cwd = asString(payload?.cwd) ?? this.cwd;
      this.startedAt = asString(payload?.timestamp) ?? event.timestamp ?? this.startedAt;
      return;
    }

    if (event.type === "turn_context") {
      const turn = this.ensureTurn(asString(payload?.turn_id), event);
      this.cwd = asString(payload?.cwd) ?? this.cwd;
      this.model = asString(payload?.model) ?? this.model;
      return;
    }

    if (event.type === "event_msg") {
      this.addEventMessage(payload, event);
      return;
    }

    if (event.type === "response_item") {
      this.addResponseItem(payload, event);
      return;
    }

    if (event.type === "compacted") {
      this.ensureCurrent(event).toolEvents.push({
        toolName: "context_compacted",
        inputPreview: "Context compacted",
        timestamp: event.timestamp
      });
    }
  }

  public build(): NormalizedSession {
    for (const command of this.pendingCommands.values()) {
      this.ensureCurrent().commandExecutions.push(stripCallId(command));
    }

    return {
      source: "codex",
      sessionId: this.sessionId,
      transcriptPath: this.meta.transcriptPath,
      cwd: this.cwd,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      model: this.model,
      turns: this.turns,
      rawStats: {
        rawLineCount: this.parsed.stats.rawLineCount,
        parseErrorCount: this.parsed.stats.parseErrorCount,
        unknownEventCount: this.parsed.stats.unknownEventCount
      }
    };
  }

  private addEventMessage(payload: Record<string, unknown> | undefined, event: ParsedCodexEvent): void {
    const payloadType = asString(payload?.type);
    if (payloadType === "task_started") {
      const turn = this.ensureTurn(asString(payload?.turn_id), event);
      turn.startedAt = asString(payload?.started_at) ?? event.timestamp ?? turn.startedAt;
      return;
    }

    if (payloadType === "task_complete") {
      const turn = this.ensureTurn(asString(payload?.turn_id), event);
      turn.completedAt = asString(payload?.completed_at) ?? event.timestamp;
      this.endedAt = turn.completedAt;
      return;
    }

    if (payloadType === "user_message") {
      const turn = this.ensureCurrent(event);
      const text = asString(payload?.message) ?? "";
      if (text) {
        turn.userMessages.push({ text, timestamp: event.timestamp });
      }
      return;
    }

    if (payloadType === "agent_message") {
      const turn = this.ensureCurrent(event);
      const text = asString(payload?.message) ?? "";
      if (text) {
        turn.assistantMessages.push({
          text,
          timestamp: event.timestamp,
          kind: payload?.phase === "final" ? "final" : "intermediate"
        });
      }
      return;
    }

    if (payloadType === "patch_apply_end") {
      const turn = this.ensureTurn(asString(payload?.turn_id), event);
      const callId = asString(payload?.call_id);
      const pending = callId ? this.pendingPatches.get(callId) : undefined;
      const changes = extractChanges(payload, pending);
      for (const change of changes) {
        turn.fileChanges.push({ ...change, turnIndex: turn.index });
      }
      if (callId) {
        this.pendingPatches.delete(callId);
      }
      return;
    }

    if (payloadType === "token_count") {
      const turn = this.ensureCurrent(event);
      turn.toolEvents.push({ toolName: "token_count", timestamp: event.timestamp });
      return;
    }

    const turn = this.ensureCurrent(event);
    turn.toolEvents.push({
      toolName: payloadType ?? "event_msg",
      inputPreview: truncate(JSON.stringify(payload ?? {}), 300),
      timestamp: event.timestamp
    });
  }

  private addResponseItem(payload: Record<string, unknown> | undefined, event: ParsedCodexEvent): void {
    const itemType = asString(payload?.type);
    const turn = this.ensureCurrent(event);

    if (itemType === "message") {
      const text = contentToText(payload?.content);
      if (text) {
        turn.assistantMessages.push({
          text,
          timestamp: event.timestamp,
          kind: payload?.phase === "final" ? "final" : "intermediate"
        });
      }
      return;
    }

    if (itemType === "function_call") {
      const name = asString(payload?.name);
      const callId = asString(payload?.call_id);
      if (name === "exec_command" && callId) {
        const args = parseJsonObject(asString(payload?.arguments));
        const command = asString(args?.cmd) ?? asString(args?.command) ?? "<unknown command>";
        this.pendingCommands.set(callId, {
          callId,
          command,
          startedAt: event.timestamp
        });
      } else {
        turn.toolEvents.push(toToolEvent(name ?? "function_call", payload, event));
      }
      return;
    }

    if (itemType === "function_call_output") {
      const callId = asString(payload?.call_id);
      const output = outputToString(payload?.output);
      if (callId && this.pendingCommands.has(callId)) {
        const command = this.pendingCommands.get(callId)!;
        command.completedAt = event.timestamp;
        command.exitCode = parseExitCode(output);
        command.stdoutPreview = truncate(output, 1000);
        turn.commandExecutions.push(stripCallId(command));
        this.pendingCommands.delete(callId);
      } else {
        turn.toolEvents.push({
          toolName: "function_call_output",
          callId,
          outputPreview: truncate(output, 500),
          timestamp: event.timestamp
        });
      }
      return;
    }

    if (itemType === "custom_tool_call") {
      const name = asString(payload?.name);
      const callId = asString(payload?.call_id);
      if (name === "apply_patch" && callId) {
        const input = asString(payload?.input);
        this.pendingPatches.set(callId, {
          callId,
          input,
          paths: input ? extractPatchPaths(input) : []
        });
      } else {
        turn.toolEvents.push(toToolEvent(name ?? "custom_tool_call", payload, event));
      }
      return;
    }

    if (itemType === "custom_tool_call_output" || itemType === "web_search_call" || itemType === "tool_search_call") {
      turn.toolEvents.push(toToolEvent(itemType, payload, event));
      return;
    }

    if (itemType === "reasoning") {
      const summary = summarizeReasoning(payload?.summary);
      if (summary) {
        turn.planUpdates.push({ text: summary });
      }
      return;
    }

    turn.toolEvents.push(toToolEvent(itemType ?? "response_item", payload, event));
  }

  private ensureCurrent(event?: ParsedCodexEvent): NormalizedTurn {
    if (!this.currentTurn) {
      return this.ensureTurn(undefined, event);
    }
    return this.currentTurn;
  }

  private ensureTurn(turnId?: string, event?: ParsedCodexEvent): NormalizedTurn {
    const existing = turnId ? this.turns.find((turn) => turn.turnId === turnId) : undefined;
    if (existing) {
      this.currentTurn = existing;
      return existing;
    }

    const turn: NormalizedTurn = {
      index: this.turns.length + 1,
      turnId,
      startedAt: event?.timestamp,
      userMessages: [],
      assistantMessages: [],
      toolEvents: [],
      fileChanges: [],
      commandExecutions: [],
      planUpdates: []
    };
    this.turns.push(turn);
    this.currentTurn = turn;
    return turn;
  }
}

function parseJsonObject(text: string | undefined): Record<string, unknown> | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return getObject(parsed);
  } catch {
    return undefined;
  }
}

function outputToString(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  return JSON.stringify(output ?? "");
}

function parseExitCode(output: string): number | undefined {
  const match = output.match(/Exit code:\s*(-?\d+)/i);
  return match ? Number(match[1]) : undefined;
}

function stripCallId(command: PendingCommand): CommandExecutionEvent {
  const { callId: _callId, ...rest } = command;
  return rest;
}

function toToolEvent(
  toolName: string,
  payload: Record<string, unknown> | undefined,
  event: ParsedCodexEvent
): ToolEvent {
  return {
    toolName,
    callId: asString(payload?.call_id),
    inputPreview: truncate(JSON.stringify(payload ?? {}), 500),
    timestamp: event.timestamp
  };
}

function extractChanges(
  payload: Record<string, unknown> | undefined,
  pending: PendingPatch | undefined
): FileChangeEvent[] {
  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  const fromPayload = changes
    .map((change): FileChangeEvent | undefined => {
      const object = getObject(change);
      const path = asString(object?.path);
      if (!path) {
        return undefined;
      }
      return {
        path,
        changeKind: mapChangeKind(asString(object?.kind)),
        diffPreview: pending?.input ? truncate(pending.input, 500) : undefined
      };
    })
    .filter((change): change is FileChangeEvent => Boolean(change));

  if (fromPayload.length > 0) {
    return fromPayload;
  }

  return (pending?.paths ?? []).map((path) => ({
    path,
    changeKind: "modified",
    diffPreview: pending?.input ? truncate(pending.input, 500) : undefined
  }));
}

function mapChangeKind(kind: string | undefined): FileChangeEvent["changeKind"] {
  if (kind === "created" || kind === "modified" || kind === "deleted" || kind === "renamed") {
    return kind;
  }
  return "unknown";
}

function extractPatchPaths(input: string): string[] {
  const paths: string[] = [];
  const regex = /^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input))) {
    const path = match[1]?.trim();
    if (path) {
      paths.push(path);
    }
  }
  return paths;
}

function summarizeReasoning(summary: unknown): string {
  if (!Array.isArray(summary)) {
    return "";
  }
  return summary
    .map((item) => {
      const object = getObject(item);
      return asString(object?.text) ?? "";
    })
    .filter(Boolean)
    .join("\n");
}
