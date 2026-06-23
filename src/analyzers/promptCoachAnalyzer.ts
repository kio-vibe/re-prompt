import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { extractJsonValue, INTERNAL_ANALYSIS_MARKER } from "./cliAnalyzer.js";
import { parsePromptCoachReport, promptCoachReportJsonSchema } from "./coachSchema.js";
import type { Engine, PromptCoachBundle, PromptCoachReport } from "../core/types.js";
import { truncate } from "../core/text.js";

interface CoachInvocation {
  command: string;
  args: string[];
  stdin: string;
  outputFile?: string;
  cleanupDir?: string;
}

interface CoachAnalyzerConfig {
  engine: Exclude<Engine, "none">;
  binary: string;
  buildInvocation(prompt: string): Promise<CoachInvocation>;
  readOutput(invocation: CoachInvocation, stdout: string): Promise<string>;
}

export interface CoachAnalyzerOptions {
  engine: Engine;
  language: "en" | "ko";
}

export abstract class PromptCoachCliAnalyzer {
  protected constructor(private readonly config: CoachAnalyzerConfig) {}

  public async analyze(bundle: PromptCoachBundle, options: CoachAnalyzerOptions): Promise<PromptCoachReport> {
    const prompt = buildPromptCoachPrompt(this.config.engine, bundle, options.language);
    const invocation = await this.config.buildInvocation(prompt);
    try {
      const result = await execa(invocation.command, invocation.args, {
        input: invocation.stdin,
        timeout: coachAnalyzerTimeoutMs(),
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
      return parsePromptCoachReport(extractJsonValue(output));
    } finally {
      if (invocation.cleanupDir) {
        await rm(invocation.cleanupDir, { recursive: true, force: true });
      }
    }
  }
}

export class CodexPromptCoachAnalyzer extends PromptCoachCliAnalyzer {
  public constructor(binary = process.env.RE_PROMPT_CODEX_BIN ?? "codex") {
    super({
      engine: "codex",
      binary,
      buildInvocation: async (prompt) => {
        const tempDir = await mkdtemp(join(tmpdir(), "re-prompt-codex-coach-"));
        const schemaPath = join(tempDir, "prompt-coach.schema.json");
        const outputPath = join(tempDir, "last-message.json");
        await writeFile(schemaPath, JSON.stringify(promptCoachReportJsonSchema, null, 2), "utf8");
        return {
          command: binary,
          args: [
            "exec",
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

export class ClaudePromptCoachAnalyzer extends PromptCoachCliAnalyzer {
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
          JSON.stringify(promptCoachReportJsonSchema),
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

export function buildPromptCoachPrompt(
  engine: Exclude<Engine, "none">,
  bundle: PromptCoachBundle,
  language: "en" | "ko"
): string {
  return [
    INTERNAL_ANALYSIS_MARKER,
    "",
    `You are the ${engine} CLI prompt coach for re-prompt.`,
    "Return only a JSON object matching the provided PromptCoachReport schema.",
    "",
    "Product goal:",
    "- This is not a generic report and not a prompt scorecard.",
    "- Analyze what the user actually wrote in this session.",
    "- Explain where their wording became ambiguous, late, too broad, or hard for an agent to execute.",
    "- Rewrite the prompt in the user's own voice and sentence structure, adding only missing scope, constraints, and verification details.",
    "",
    "Rules:",
    "- Use only the redacted PromptCoachBundle.",
    "- Do not include raw transcripts, hidden reasoning, secrets, or local unredacted paths.",
    "- Do not use internal terms like Friction, file_churn, heuristic-only, or Main cause in user-facing fields.",
    "- Do not write generic advice like 'be more specific' or 'provide more context'.",
    "- Keep the rewrite copy-pasteable.",
    "- Fill shortRewriteInYourVoice with a 1-3 line version the user could paste immediately.",
    "- Fill rewriteInYourVoice with the fuller version that adds constraints, scope, and verification checks.",
    "- Preserve the user's language. If outputLanguage is ko, write Korean.",
    "- If the user's original wording is rough, keep that natural shape while making it clearer.",
    "",
    `outputLanguage: ${language}`,
    "",
    "Redacted PromptCoachBundle JSON:",
    JSON.stringify(bundle, null, 2)
  ].join("\n");
}

export function buildFallbackPromptCoachReport(
  bundle: PromptCoachBundle,
  options: CoachAnalyzerOptions & { fallbackReason?: string; fallback: boolean }
): PromptCoachReport {
  const language = options.language;
  const initial = bundle.userMessages.find((message) => message.kind === "initial") ?? bundle.userMessages[0];
  const firstSignal = bundle.evidence.signals[0];
  const changedFiles = bundle.evidence.changedFiles.slice(0, 3);
  const tests = bundle.evidence.observedTestCommands.slice(0, 2);
  const constraint = bundle.evidence.lateConstraints[0] ?? bundle.evidence.userCorrections[0];
  const original = initial?.text ?? (language === "ko" ? "원래 요청을 확인하기 어렵습니다." : "The original request is unclear.");

  const report: PromptCoachReport = {
    schemaVersion: 1,
    session: {
      source: "codex",
      sessionId: bundle.session.sessionId,
      title: language === "ko" ? "프롬프트 코치" : "Prompt coach",
      confidence: "low"
    },
    language,
    oneLineTake:
      language === "ko"
        ? "AI 분석을 쓰지 못해 로컬 근거만으로 낮은 확신의 코칭을 만들었습니다."
        : "External AI analysis was unavailable, so this is a low-confidence local coach summary.",
    whatYouActuallyWrote:
      language === "ko"
        ? `처음 요청은 대략 이렇게 시작했습니다: "${truncate(original, 260)}"`
        : `Your first request started roughly like this: "${truncate(original, 260)}"`,
    whereItWentWrong:
      language === "ko"
        ? `처음 문장에 범위, 유지해야 할 조건, 완료 전 확인 명령이 충분히 고정되지 않았습니다.${firstSignal ? ` 특히 ${coachSignalLabel(firstSignal.kind, language)} 신호가 보였습니다.` : ""}`
        : `The wording did not lock scope, constraints, and verification up front.${firstSignal ? ` The main signal was ${coachSignalLabel(firstSignal.kind, language)}.` : ""}`,
    shortRewriteInYourVoice: buildFallbackShortRewrite(language, original, tests, constraint),
    rewriteInYourVoice: buildFallbackRewrite(language, original, changedFiles, tests, constraint),
    whyThisWorks:
      language === "ko"
        ? "원래 말투를 시작점으로 두고, 에이전트가 놓치기 쉬운 범위와 확인 기준만 앞에 붙였기 때문입니다."
        : "It keeps your original wording as the base, then adds the scope and verification details an agent needs up front.",
    rescueLine:
      language === "ko"
        ? "여기서 잠깐 멈추고, 지금까지 바꾼 파일과 아직 확인하지 않은 명령을 먼저 정리해줘."
        : "Pause here and first list the files changed so far plus the verification commands not yet run.",
    confidence: "low",
    limitations: [
      language === "ko"
        ? "이 결과는 외부 AI coach가 실패했을 때의 로컬 fallback입니다."
        : "This is a local fallback produced after the external AI coach was unavailable."
    ]
  };
  return withCoachAnalysis(report, {
    requestedEngine: options.engine,
    usedEngine: "none",
    fallback: options.fallback,
    fallbackReason: options.fallbackReason
  });
}

export function lintPromptCoachReport(report: PromptCoachReport, bundle: PromptCoachBundle): string[] {
  const issues: string[] = [];
  const text = [
    report.oneLineTake,
    report.whatYouActuallyWrote,
    report.whereItWentWrong,
    report.shortRewriteInYourVoice ?? "",
    report.rewriteInYourVoice,
    report.whyThisWorks,
    report.rescueLine
  ].join("\n");
  if (/\b(be more specific|provide more context|prompt score|프롬프트 점수)\b/i.test(text)) {
    issues.push("generic_advice");
  }
  if (/\b(Friction|file_churn|heuristic-only|Main cause)\b/i.test(text)) {
    issues.push("internal_jargon");
  }
  if (!hasUserLanguageAnchor(text, bundle)) {
    issues.push("missing_user_phrase_anchor");
  }
  if (report.rewriteInYourVoice.trim().length < 24) {
    issues.push("rewrite_too_short");
  }
  if (report.shortRewriteInYourVoice && report.shortRewriteInYourVoice.trim().length < 12) {
    issues.push("short_rewrite_too_short");
  }
  return issues;
}

export function withCoachAnalysis(
  report: PromptCoachReport,
  analysis: NonNullable<PromptCoachReport["analysis"]>
): PromptCoachReport {
  return {
    ...report,
    analysis
  };
}

function buildFallbackRewrite(
  language: "en" | "ko",
  original: string,
  changedFiles: string[],
  tests: string[],
  constraint: string | undefined
): string {
  if (language === "ko") {
    return [
      truncate(original, 260),
      "",
      "다만 처음부터 아래를 같이 고정해줘.",
      changedFiles.length > 0 ? `- 관련 파일은 ${changedFiles.map(formatCode).join(", ")} 중심으로 봐줘.` : "- 관련 파일을 먼저 확인하고 범위를 좁혀줘.",
      constraint ? `- 이 조건은 중간에 바꾸지 말고 유지해줘: "${truncate(constraint, 180)}"` : "- 기존 동작을 바꾸면 먼저 물어봐줘.",
      tests.length > 0 ? `- 완료 전에는 ${tests.map(formatCode).join(", ")}를 실행해줘.` : "- 완료 전에는 관련 테스트/타입체크/빌드를 실행해줘.",
      "- 범위가 커지면 멈추고 먼저 확인해줘."
    ].join("\n");
  }

  return [
    truncate(original, 260),
    "",
    "Add these constraints up front:",
    changedFiles.length > 0 ? `- Focus on ${changedFiles.map(formatCode).join(", ")}.` : "- Inspect the relevant files first and keep the scope narrow.",
    constraint ? `- Preserve this constraint: "${truncate(constraint, 180)}"` : "- Ask before changing existing behavior.",
    tests.length > 0 ? `- Before finishing, run ${tests.map(formatCode).join(", ")}.` : "- Before finishing, run the relevant test/typecheck/build command.",
    "- If the scope grows, stop and confirm before continuing."
  ].join("\n");
}

function buildFallbackShortRewrite(
  language: "en" | "ko",
  original: string,
  tests: string[],
  constraint: string | undefined
): string {
  const base = truncate(original, 180);
  if (language === "ko") {
    const checks = tests.length > 0 ? `${tests.map(formatCode).join(", ")}까지 확인해줘` : "관련 테스트까지 확인해줘";
    const guard = constraint ? `중간에 나온 이 조건도 처음부터 지켜줘: "${truncate(constraint, 120)}"` : "기존 동작을 바꾸면 먼저 물어봐줘";
    return `${base}\n\n다만 범위 먼저 좁히고, ${guard}. 완료 전에는 ${checks}.`;
  }

  const checks = tests.length > 0 ? `run ${tests.map(formatCode).join(", ")}` : "run the relevant checks";
  const guard = constraint ? `preserve this constraint from the start: "${truncate(constraint, 120)}"` : "ask before changing existing behavior";
  return `${base}\n\nKeep the scope tight, ${guard}, and before finishing ${checks}.`;
}

function coachSignalLabel(kind: string, language: "en" | "ko"): string {
  const labels: Record<string, { en: string; ko: string }> = {
    user_correction: { en: "user correction", ko: "사용자가 방향을 다시 잡아준 흔적" },
    late_constraint: { en: "late constraint", ko: "중요한 조건이 뒤늦게 나온 흔적" },
    repeated_failure: { en: "repeated failure", ko: "같은 실패가 반복된 흔적" },
    verification_gap: { en: "verification gap", ko: "마지막 확인이 부족한 흔적" },
    scope_drift: { en: "scope drift", ko: "범위가 넓어진 흔적" },
    file_churn: { en: "repeated file edits", ko: "파일을 여러 번 고치며 왕복한 흔적" },
    premature_edit: { en: "premature edit", ko: "확인 전에 편집이 먼저 들어간 흔적" },
    environment_gap: { en: "environment gap", ko: "환경 조건이 빠진 흔적" },
    low_friction: { en: "low friction", ko: "가벼운 점검 신호" }
  };
  return labels[kind]?.[language] ?? kind.replaceAll("_", " ");
}

function hasUserLanguageAnchor(text: string, bundle: PromptCoachBundle): boolean {
  const tokens = bundle.userMessages
    .flatMap((message) => message.text.match(/[가-힣]{2,}|[A-Za-z][A-Za-z0-9_-]{3,}/g) ?? [])
    .filter((token) => !/^(this|that|with|from|have|will|should|please|합니다|그리고|하지만)$/i.test(token))
    .slice(0, 80);
  if (tokens.length === 0) {
    return true;
  }
  return tokens.some((token) => text.includes(token));
}

function formatCode(value: string): string {
  return `\`${value}\``;
}

function coachAnalyzerTimeoutMs(): number {
  const configured = Number(process.env.RE_PROMPT_ANALYZER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
}

function preview(value: string): string {
  return value.length > 240 ? `${value.slice(0, 239)}…` : value;
}
