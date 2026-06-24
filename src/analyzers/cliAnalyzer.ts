import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import type { Analyzer, AnalyzerOptions } from "./Analyzer.js";
import { parseRetroReport, retroReportJsonSchema } from "./reportSchema.js";
import type { Engine } from "./engine.js";
import type { EvidenceBundle, RetroReport } from "../core/types.js";

export const INTERNAL_ANALYSIS_MARKER = "RE_PROMPT_INTERNAL_ANALYSIS";

interface CliInvocation {
  command: string;
  args: string[];
  stdin: string;
  outputFile?: string;
  cleanupDir?: string;
}

interface CliAnalyzerConfig {
  engine: Exclude<Engine, "none">;
  binary: string;
  buildInvocation(prompt: string): Promise<CliInvocation>;
  readOutput(invocation: CliInvocation, stdout: string): Promise<string>;
}

export abstract class CliAnalyzer implements Analyzer {
  protected constructor(private readonly config: CliAnalyzerConfig) {}

  public async analyze(bundle: EvidenceBundle, _options: AnalyzerOptions): Promise<RetroReport> {
    const prompt = buildAnalyzerPrompt(this.config.engine, bundle);
    const invocation = await this.config.buildInvocation(prompt);
    try {
      const result = await execa(invocation.command, invocation.args, {
        input: invocation.stdin,
        timeout: analyzerTimeoutMs(),
        reject: false,
        env: {
          ...process.env,
          RE_PROMPT_INTERNAL_ANALYSIS: "1"
        }
      });
      if (result.exitCode !== 0) {
        throw new Error(`${this.config.engine} CLI exited ${result.exitCode}: ${preview(result.stderr || result.stdout)}`);
      }
      const output = await this.config.readOutput(invocation, result.stdout);
      return parseRetroReport(extractJsonValue(output));
    } finally {
      if (invocation.cleanupDir) {
        await rm(invocation.cleanupDir, { recursive: true, force: true });
      }
    }
  }
}

export class CodexCliAnalyzer extends CliAnalyzer {
  public constructor(binary = process.env.RE_PROMPT_CODEX_BIN ?? "codex") {
    super({
      engine: "codex",
      binary,
      buildInvocation: async (prompt) => {
        const tempDir = await mkdtemp(join(tmpdir(), "re-prompt-codex-analyzer-"));
        const schemaPath = join(tempDir, "retro-report.schema.json");
        const outputPath = join(tempDir, "last-message.json");
        await writeFile(schemaPath, JSON.stringify(retroReportJsonSchema, null, 2), "utf8");
        return {
          command: binary,
          args: [
            "exec",
            "--disable",
            "plugins",
            "--ephemeral",
            "--ignore-user-config",
            "--ignore-rules",
            "--sandbox",
            "read-only",
            "--skip-git-repo-check",
            "--color",
            "never",
            "--output-schema",
            schemaPath,
            "--output-last-message",
            outputPath,
            "-"
          ],
          stdin: prompt,
          outputFile: outputPath,
          cleanupDir: tempDir
        };
      },
      readOutput: async (invocation, stdout) => {
        if (!invocation.outputFile) {
          return stdout;
        }
        const fileOutput = await readFile(invocation.outputFile, "utf8").catch(() => "");
        return fileOutput || stdout;
      }
    });
  }
}

export class ClaudeCliAnalyzer extends CliAnalyzer {
  public constructor(binary = process.env.RE_PROMPT_CLAUDE_BIN ?? "claude") {
    super({
      engine: "claude",
      binary,
      buildInvocation: async (prompt) => ({
        command: binary,
        args: [
          "-p",
          "--output-format",
          "json",
          "--json-schema",
          JSON.stringify(retroReportJsonSchema),
          "--no-session-persistence",
          "--tools",
          ""
        ],
        stdin: prompt
      }),
      readOutput: async (_invocation, stdout) => stdout
    });
  }
}

export function buildAnalyzerPrompt(engine: Exclude<Engine, "none">, bundle: EvidenceBundle): string {
  return [
    INTERNAL_ANALYSIS_MARKER,
    "",
    `You are the ${engine} CLI analyzer for re-prompt.`,
    "Analyze the redacted EvidenceBundle and return only a JSON object matching the provided RetroReport schema.",
    "",
    "Rules:",
    "- Use only evidence present in the bundle.",
    "- Do not infer a confident single goal when bundle.uncertainty.goalKnown is false.",
    "- Every finding must cite turn evidence from the bundle.",
    "- The better initial prompt must include concrete anchors from the bundle when anchors exist.",
    "- Do not suggest AGENTS.md patches for one-off constraints.",
    "- Do not include raw transcripts, hidden reasoning, secrets, or local unredacted paths.",
    "",
    "Redacted EvidenceBundle JSON:",
    JSON.stringify(bundle, null, 2)
  ].join("\n");
}

export function extractJsonValue(output: string): unknown {
  const trimmed = output.trim();
  if (!trimmed) {
    throw new Error("Analyzer returned empty output.");
  }
  const direct = tryParseJson(trimmed);
  if (direct.ok) {
    return unwrapAnalyzerJson(direct.value);
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const parsed = tryParseJson(fenced[1]!.trim());
    if (parsed.ok) {
      return unwrapAnalyzerJson(parsed.value);
    }
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const parsed = tryParseJson(trimmed.slice(firstBrace, lastBrace + 1));
    if (parsed.ok) {
      return unwrapAnalyzerJson(parsed.value);
    }
  }
  throw new Error(`Analyzer output was not valid JSON: ${preview(trimmed)}`);
}

function unwrapAnalyzerJson(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion === 1) {
    return record;
  }
  const result = record.result;
  if (typeof result === "string") {
    const parsed = tryParseJson(result);
    return parsed.ok ? parsed.value : result;
  }
  if (result && typeof result === "object") {
    return result;
  }
  return value;
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function analyzerTimeoutMs(): number {
  const configured = Number(process.env.RE_PROMPT_ANALYZER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
}

function preview(value: string): string {
  return value.length > 240 ? `${value.slice(0, 239)}…` : value;
}
