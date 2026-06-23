import { z } from "zod";
import type { PromptCoachReport } from "../core/types.js";

const confidenceSchema = z.enum(["low", "medium", "high"]);
const languageSchema = z.enum(["en", "ko"]);

export const promptCoachReportSchema: z.ZodType<PromptCoachReport> = z
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
      confidence: confidenceSchema
    }),
    language: languageSchema,
    oneLineTake: z.string(),
    whatYouActuallyWrote: z.string(),
    whereItWentWrong: z.string(),
    rewriteInYourVoice: z.string(),
    whyThisWorks: z.string(),
    rescueLine: z.string(),
    confidence: confidenceSchema,
    limitations: z.array(z.string())
  })
  .passthrough();

export const promptCoachReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "session",
    "language",
    "oneLineTake",
    "whatYouActuallyWrote",
    "whereItWentWrong",
    "rewriteInYourVoice",
    "whyThisWorks",
    "rescueLine",
    "confidence",
    "limitations"
  ],
  properties: {
    schemaVersion: { type: "integer", enum: [1] },
    session: {
      type: "object",
      additionalProperties: false,
      required: ["source", "sessionId", "title", "confidence"],
      properties: {
        source: { type: "string", enum: ["codex"] },
        sessionId: { type: "string" },
        title: { type: "string" },
        confidence: { enum: ["low", "medium", "high"] }
      }
    },
    language: { enum: ["en", "ko"] },
    oneLineTake: { type: "string" },
    whatYouActuallyWrote: { type: "string" },
    whereItWentWrong: { type: "string" },
    rewriteInYourVoice: { type: "string" },
    whyThisWorks: { type: "string" },
    rescueLine: { type: "string" },
    confidence: { enum: ["low", "medium", "high"] },
    limitations: { type: "array", items: { type: "string" } }
  }
} as const;

export function parsePromptCoachReport(value: unknown): PromptCoachReport {
  return promptCoachReportSchema.parse(value);
}
