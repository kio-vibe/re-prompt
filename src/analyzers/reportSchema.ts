import { z } from "zod";
import type { RetroReport } from "../core/types.js";

const confidenceSchema = z.enum(["low", "medium", "high"]);
const outcomeSchema = z.enum(["successful", "partially_successful", "failed", "unclear"]);
const frictionLabelSchema = z.enum(["low", "medium", "high", "severe"]);
const mainCauseSchema = z.enum([
  "missing_context",
  "late_constraint",
  "unclear_acceptance_criteria",
  "environment_gap",
  "scope_drift",
  "verification_gap",
  "agent_loop",
  "other"
]);
const evidenceKindSchema = z.enum([
  "user_message",
  "assistant_message",
  "command",
  "file_change",
  "plan_update",
  "usage",
  "parser_note"
]);

const evidenceRefSchema = z
  .object({
    turnIndex: z.number().int().positive(),
    eventKind: evidenceKindSchema,
    quote: z.string().optional(),
    summary: z.string().optional(),
    path: z.string().optional(),
    command: z.string().optional()
  })
  .refine((value) => Boolean(value.quote || value.summary || value.path || value.command), {
    message: "Evidence must include quote, summary, path, or command."
  });

const suggestedFixSchema = z.union([
  z.object({ kind: z.literal("initial_prompt"), text: z.string() }),
  z.object({ kind: z.literal("rescue_prompt"), turnIndex: z.number().int().positive(), text: z.string() }),
  z.object({ kind: z.literal("agents_md_rule"), text: z.string() }),
  z.object({ kind: z.literal("workflow"), text: z.string() })
]);

export const retroReportSchema: z.ZodType<RetroReport> = z
  .object({
    schemaVersion: z.literal(1),
    analysis: z
      .object({
        requestedEngine: z.enum(["none", "codex", "claude"]),
        usedEngine: z.enum(["none", "codex", "claude"]),
        fallback: z.boolean(),
        fallbackReason: z.string().optional()
      })
      .optional(),
    session: z.object({
      source: z.literal("codex"),
      sessionId: z.string(),
      title: z.string(),
      inferredGoal: z.string(),
      outcome: outcomeSchema,
      confidence: confidenceSchema
    }),
    selection: z
      .object({
        command: z.enum(["last", "retro"]),
        source: z.literal("codex"),
        sessionId: z.string(),
        transcriptPath: z.string(),
        selectedBecause: z.string(),
        startedAt: z.string().optional(),
        turnsAnalyzed: z.number().int().nonnegative(),
        skippedNewerSessions: z
          .object({
            tooLarge: z.number().int().nonnegative(),
            parseFailed: z.number().int().nonnegative(),
            other: z.number().int().nonnegative()
          })
          .optional(),
        confidence: confidenceSchema,
        confidenceReason: z.string().optional()
      })
      .optional(),
    executiveSummary: z.string(),
    friction: z.object({
      score: z.number().int().min(0).max(100),
      label: frictionLabelSchema,
      mainCause: mainCauseSchema
    }),
    turningPoints: z.array(
      z.object({
        turnIndex: z.number().int().positive(),
        title: z.string(),
        whatHappened: z.string(),
        whyItMattered: z.string(),
        evidence: z.array(evidenceRefSchema)
      })
    ),
    findings: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        severity: confidenceSchema,
        confidence: confidenceSchema,
        diagnosis: z.string(),
        evidence: z.array(evidenceRefSchema),
        betterBehavior: z.string(),
        suggestedFix: suggestedFixSchema
      })
    ),
    betterInitialPrompt: z.object({
      prompt: z.string(),
      whyThisWouldHelp: z.string(),
      confidence: confidenceSchema
    }),
    rescuePrompts: z.array(
      z.object({
        turnIndex: z.number().int().positive(),
        prompt: z.string(),
        useWhen: z.string(),
        expectedEffect: z.string(),
        confidence: confidenceSchema
      })
    ),
    agentsMdPatch: z.object({
      shouldPatch: z.boolean(),
      target: z.enum(["global", "repo", "subdir", "none"]),
      rationale: z.string(),
      patchMarkdown: z.string(),
      rules: z.array(z.string())
    }),
    nextSessionChecklist: z.array(z.string()),
    limitations: z.array(z.string())
  })
  .passthrough();

export const retroReportJsonSchema = {
  type: "object",
  additionalProperties: true,
  required: [
    "schemaVersion",
    "session",
    "executiveSummary",
    "friction",
    "turningPoints",
    "findings",
    "betterInitialPrompt",
    "rescuePrompts",
    "agentsMdPatch",
    "nextSessionChecklist",
    "limitations"
  ],
  properties: {
    schemaVersion: { const: 1 },
    session: {
      type: "object",
      required: ["source", "sessionId", "title", "inferredGoal", "outcome", "confidence"],
      properties: {
        source: { const: "codex" },
        sessionId: { type: "string" },
        title: { type: "string" },
        inferredGoal: { type: "string" },
        outcome: { enum: ["successful", "partially_successful", "failed", "unclear"] },
        confidence: { enum: ["low", "medium", "high"] }
      }
    },
    executiveSummary: { type: "string" },
    friction: {
      type: "object",
      required: ["score", "label", "mainCause"],
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
        label: { enum: ["low", "medium", "high", "severe"] },
        mainCause: {
          enum: [
            "missing_context",
            "late_constraint",
            "unclear_acceptance_criteria",
            "environment_gap",
            "scope_drift",
            "verification_gap",
            "agent_loop",
            "other"
          ]
        }
      }
    },
    turningPoints: { type: "array", items: { type: "object" } },
    findings: { type: "array", items: { type: "object" } },
    betterInitialPrompt: {
      type: "object",
      required: ["prompt", "whyThisWouldHelp", "confidence"],
      properties: {
        prompt: { type: "string" },
        whyThisWouldHelp: { type: "string" },
        confidence: { enum: ["low", "medium", "high"] }
      }
    },
    rescuePrompts: { type: "array", items: { type: "object" } },
    agentsMdPatch: {
      type: "object",
      required: ["shouldPatch", "target", "rationale", "patchMarkdown", "rules"],
      properties: {
        shouldPatch: { type: "boolean" },
        target: { enum: ["global", "repo", "subdir", "none"] },
        rationale: { type: "string" },
        patchMarkdown: { type: "string" },
        rules: { type: "array", items: { type: "string" } }
      }
    },
    nextSessionChecklist: { type: "array", items: { type: "string" } },
    limitations: { type: "array", items: { type: "string" } }
  }
} as const;

export function parseRetroReport(value: unknown): RetroReport {
  return retroReportSchema.parse(value);
}
