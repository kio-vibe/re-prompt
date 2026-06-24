import { z } from "zod";
import type { PromptHabitReport } from "../core/types.js";

const evidenceIdsSchema = z.array(z.string()).min(1);

export const promptHabitReportSchema: z.ZodType<PromptHabitReport> = z
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
    language: z.enum(["en", "ko"]),
    oneLineTake: z.string().min(1),
    strengths: z
      .array(
        z.object({
          title: z.string().min(1),
          detail: z.string().min(1),
          evidenceSessionIds: evidenceIdsSchema
        })
      )
      .max(3),
    risks: z
      .array(
        z.object({
          title: z.string().min(1),
          detail: z.string().min(1),
          evidenceSessionIds: evidenceIdsSchema
        })
      )
      .max(3),
    repeatedPhrases: z.array(z.string().min(1)).max(6),
    defaultRewrite: z.string().min(1),
    evidenceSessions: z
      .array(
        z.object({
          index: z.number().int().positive(),
          sessionId: z.string().min(1),
          title: z.string().min(1),
          whyRelevant: z.string().min(1),
          startedAt: z.string().optional()
        })
      )
      .max(3),
    confidence: z.enum(["low", "medium", "high"]),
    limitations: z.array(z.string())
  })
  .strict();

export const promptHabitReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "language",
    "oneLineTake",
    "strengths",
    "risks",
    "repeatedPhrases",
    "defaultRewrite",
    "evidenceSessions",
    "confidence",
    "limitations"
  ],
  properties: {
    schemaVersion: { const: 1 },
    analysis: {
      type: "object",
      additionalProperties: false,
      required: ["requestedEngine", "usedEngine", "fallback"],
      properties: {
        requestedEngine: { enum: ["none", "codex", "claude"] },
        usedEngine: { enum: ["none", "codex", "claude"] },
        fallback: { type: "boolean" },
        fallbackReason: { type: "string" }
      }
    },
    language: { enum: ["en", "ko"] },
    oneLineTake: { type: "string" },
    strengths: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "evidenceSessionIds"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          evidenceSessionIds: { type: "array", minItems: 1, items: { type: "string" } }
        }
      }
    },
    risks: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "evidenceSessionIds"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          evidenceSessionIds: { type: "array", minItems: 1, items: { type: "string" } }
        }
      }
    },
    repeatedPhrases: { type: "array", maxItems: 6, items: { type: "string" } },
    defaultRewrite: { type: "string" },
    evidenceSessions: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["index", "sessionId", "title", "whyRelevant"],
        properties: {
          index: { type: "integer", minimum: 1 },
          sessionId: { type: "string" },
          title: { type: "string" },
          whyRelevant: { type: "string" },
          startedAt: { type: "string" }
        }
      }
    },
    confidence: { enum: ["low", "medium", "high"] },
    limitations: { type: "array", items: { type: "string" } }
  }
} as const;

export function parsePromptHabitReport(value: unknown): PromptHabitReport {
  return promptHabitReportSchema.parse(value);
}
