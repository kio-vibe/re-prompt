import type { ParsedCodexEvent, ParsedCodexTranscript, UnknownEventPreview } from "../../core/types.js";
import { truncate } from "../../core/text.js";

const KNOWN_TOP_LEVEL_TYPES = new Set([
  "session_meta",
  "turn_context",
  "event_msg",
  "response_item",
  "compacted"
]);

export function parseCodexJsonl(input: string): ParsedCodexTranscript {
  const lines = input.split(/\r?\n/).filter((line) => line.length > 0);
  const events: ParsedCodexEvent[] = [];
  const errors: ParsedCodexTranscript["errors"] = [];
  const unknownEvents: UnknownEventPreview[] = [];

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push({
          lineNumber,
          preview: truncate(line, 200),
          message: "Line did not parse to a JSON object"
        });
        continue;
      }

      const raw = parsed as Record<string, unknown>;
      const type = typeof raw.type === "string" ? raw.type : "unknown";
      const event: ParsedCodexEvent = {
        lineNumber,
        timestamp: typeof raw.timestamp === "string" ? raw.timestamp : undefined,
        type,
        payload: raw.payload,
        raw
      };
      events.push(event);

      if (!KNOWN_TOP_LEVEL_TYPES.has(type)) {
        unknownEvents.push({
          lineNumber,
          type,
          preview: truncate(line, 300)
        });
      }
    } catch (error) {
      errors.push({
        lineNumber,
        preview: truncate(line, 200),
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    events,
    errors,
    unknownEvents,
    stats: {
      rawLineCount: lines.length,
      parseErrorCount: errors.length,
      unknownEventCount: unknownEvents.length
    }
  };
}
