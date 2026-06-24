import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execa } from "execa";
import { extractJsonValue, INTERNAL_ANALYSIS_MARKER } from "./cliAnalyzer.js";
import { parsePromptHabitReport, promptHabitReportJsonSchema } from "./habitSchema.js";
import type { Engine, PromptHabitBundle, PromptHabitReport } from "../core/types.js";
import { truncate } from "../core/text.js";

interface HabitInvocation {
  command: string;
  args: string[];
  stdin: string;
  outputFile?: string;
  cleanupDir?: string;
}

interface HabitAnalyzerConfig {
  engine: Exclude<Engine, "none">;
  binary: string;
  buildInvocation(prompt: string): Promise<HabitInvocation>;
  readOutput(invocation: HabitInvocation, stdout: string): Promise<string>;
}

export interface HabitAnalyzerOptions {
  engine: Engine;
  language: "en" | "ko";
}

export abstract class PromptHabitCliAnalyzer {
  protected constructor(private readonly config: HabitAnalyzerConfig) {}

  public async analyze(bundle: PromptHabitBundle, options: HabitAnalyzerOptions): Promise<PromptHabitReport> {
    const prompt = buildPromptHabitPrompt(this.config.engine, bundle, options.language);
    const invocation = await this.config.buildInvocation(prompt);
    try {
      const result = await execa(invocation.command, invocation.args, {
        input: invocation.stdin,
        timeout: habitAnalyzerTimeoutMs(),
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
      return parsePromptHabitReport(extractJsonValue(output));
    } finally {
      if (invocation.cleanupDir) {
        await rm(invocation.cleanupDir, { recursive: true, force: true });
      }
    }
  }
}

export class CodexPromptHabitAnalyzer extends PromptHabitCliAnalyzer {
  public constructor(binary = process.env.RE_PROMPT_CODEX_BIN ?? "codex") {
    super({
      engine: "codex",
      binary,
      buildInvocation: async (prompt) => {
        const tempDir = await mkdtemp(join(tmpdir(), "re-prompt-codex-habits-"));
        const schemaPath = join(tempDir, "prompt-habits.schema.json");
        const outputPath = join(tempDir, "last-message.json");
        await writeFile(schemaPath, JSON.stringify(promptHabitReportJsonSchema, null, 2), "utf8");
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

export class ClaudePromptHabitAnalyzer extends PromptHabitCliAnalyzer {
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
          JSON.stringify(promptHabitReportJsonSchema),
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

export function buildPromptHabitPrompt(
  engine: Exclude<Engine, "none">,
  bundle: PromptHabitBundle,
  language: "en" | "ko"
): string {
  return [
    INTERNAL_ANALYSIS_MARKER,
    "",
    `You are the ${engine} CLI prompt-habit coach for re-prompt.`,
    "Return only a JSON object matching the provided PromptHabitReport schema.",
    "",
    "Product goal:",
    "- The first screen should not be a session scorecard.",
    "- Read recent user-authored messages and infer prompt habits cautiously.",
    "- Explain what the user is already doing well, what repeatedly makes sessions harder, and what they can say next time.",
    "- Keep the defaultRewrite close to the user's own wording and sentence shape.",
    "- Use evidenceSessions only from session ids present in the bundle.",
    "",
    "Rules:",
    "- Use only the redacted PromptHabitBundle.",
    "- Do not include raw transcripts, hidden reasoning, assistant text, tool output, secrets, or local unredacted paths.",
    "- Do not use internal terms like Friction, file_churn, heuristic-only, or Main cause.",
    "- Do not overgeneralize. Avoid words like always/never/항상/절대 unless quoting the user.",
    "- Do not write generic advice like 'be more specific' or 'provide more context'.",
    "- Each strength and risk must include at least one evidenceSessionIds value from the bundle.",
    "- Fill evidenceSessions with 2-3 sessions that best support the habit profile.",
    "- Preserve the user's language. If outputLanguage is ko, write Korean.",
    "",
    `outputLanguage: ${language}`,
    "",
    "Redacted PromptHabitBundle JSON:",
    JSON.stringify(bundle, null, 2)
  ].join("\n");
}

export function buildFallbackPromptHabitReport(
  bundle: PromptHabitBundle,
  options: HabitAnalyzerOptions & { fallbackReason?: string; fallback: boolean }
): PromptHabitReport {
  const language = options.language;
  const evidenceSessions = bundle.sessions.slice(0, 3).map((session, index) => ({
    index: index + 1,
    sessionId: session.sessionId,
    title: session.chatSummary,
    whyRelevant: fallbackWhyRelevant(session.mainIssue, language),
    startedAt: session.startedAt
  }));
  const evidenceIds = evidenceSessions.map((session) => session.sessionId);
  const firstUserText = bundle.userMessages[0]?.text ?? (language === "ko" ? "최근 요청 문장을 충분히 확인하지 못했습니다." : "Recent user wording was not visible enough.");

  const report: PromptHabitReport = {
    schemaVersion: 1,
    language,
    oneLineTake:
      language === "ko"
        ? "AI habit 분석을 쓰지 못해, 최근 세션 신호만으로 낮은 확신의 습관 요약을 만들었습니다."
        : "External habit analysis was unavailable, so this is a low-confidence local habit summary.",
    strengths: [
      {
        title: language === "ko" ? "계획과 검증을 명시하려는 습관" : "You tend to name plans and checks",
        detail:
          language === "ko"
            ? "최근 요청에는 구현 계획, 검증 명령, 릴리스 기준을 직접 적는 흐름이 보입니다."
            : "Recent requests often name implementation plans, checks, and release criteria directly.",
        evidenceSessionIds: evidenceIds.slice(0, 2)
      }
    ].filter((item) => item.evidenceSessionIds.length > 0),
    risks: buildFallbackRisks(bundle, language, evidenceIds),
    repeatedPhrases: repeatedPhraseHints(bundle, language),
    defaultRewrite: buildFallbackDefaultRewrite(bundle, language, firstUserText),
    evidenceSessions,
    confidence: "low",
    limitations: [
      language === "ko"
        ? "이 결과는 외부 AI coach가 실패했을 때의 로컬 fallback입니다."
        : "This is a local fallback produced after the external AI habit coach was unavailable."
    ]
  };

  return withHabitAnalysis(report, {
    requestedEngine: options.engine,
    usedEngine: "none",
    fallback: options.fallback,
    fallbackReason: options.fallbackReason
  });
}

export function lintPromptHabitReport(report: PromptHabitReport, bundle: PromptHabitBundle): string[] {
  const issues: string[] = [];
  const sessionIds = new Set(bundle.sessions.map((session) => session.sessionId));
  const text = [
    report.oneLineTake,
    ...report.strengths.flatMap((item) => [item.title, item.detail]),
    ...report.risks.flatMap((item) => [item.title, item.detail]),
    ...report.repeatedPhrases,
    report.defaultRewrite,
    ...report.evidenceSessions.flatMap((item) => [item.title, item.whyRelevant])
  ].join("\n");

  if (/\b(be more specific|provide more context|prompt score|프롬프트 점수)\b/i.test(text)) {
    issues.push("generic_advice");
  }
  if (/\b(Friction|file_churn|heuristic-only|Main cause)\b/i.test(text)) {
    issues.push("internal_jargon");
  }
  if (/\b(always|never)\b/i.test(text) || /(항상|절대)/.test(text)) {
    issues.push("overgeneralized_habit");
  }
  for (const item of [...report.strengths, ...report.risks]) {
    if (item.evidenceSessionIds.length === 0 || item.evidenceSessionIds.some((sessionId) => !sessionIds.has(sessionId))) {
      issues.push("missing_evidence_session");
      break;
    }
  }
  if (bundle.sessions.length > 0 && report.evidenceSessions.length === 0) {
    issues.push("missing_evidence_sessions");
  }
  if (report.defaultRewrite.trim().length < 24) {
    issues.push("default_rewrite_too_short");
  }
  if (!hasUserLanguageAnchor(report.defaultRewrite, bundle)) {
    issues.push("missing_user_phrase_anchor");
  }
  return issues;
}

export function withHabitAnalysis(
  report: PromptHabitReport,
  analysis: NonNullable<PromptHabitReport["analysis"]>
): PromptHabitReport {
  return {
    ...report,
    analysis
  };
}

function buildFallbackRisks(bundle: PromptHabitBundle, language: "en" | "ko", evidenceIds: string[]): PromptHabitReport["risks"] {
  if (evidenceIds.length === 0) {
    return [];
  }
  const firstRisk =
    bundle.evidence.lateConstraints.length > 0 || bundle.evidence.userCorrections.length > 0
      ? {
          title: language === "ko" ? "중요한 기준이 뒤에 붙는 편" : "Important criteria arrive late",
          detail:
            language === "ko"
              ? "중간에 조건이나 방향 수정이 들어오면 에이전트가 이미 만든 구조를 다시 고치게 됩니다."
              : "When constraints or corrections arrive mid-session, the agent often has to rework earlier decisions.",
          evidenceSessionIds: evidenceIds.slice(0, 2)
        }
      : {
          title: language === "ko" ? "완료 기준이 늦게 선명해질 수 있음" : "Done criteria can become clear late",
          detail:
            language === "ko"
              ? "처음 요청에 범위와 확인 명령을 같이 붙이면 왕복을 더 줄일 수 있습니다."
              : "Adding scope and verification commands to the first request can reduce avoidable back-and-forth.",
          evidenceSessionIds: evidenceIds.slice(0, 2)
        };
  return [firstRisk];
}

function repeatedPhraseHints(bundle: PromptHabitBundle, language: "en" | "ko"): string[] {
  const userText = bundle.userMessages.map((message) => message.text).join("\n");
  const phrases: string[] = [];
  if (/PLEASE IMPLEMENT THIS PLAN/i.test(userText)) {
    phrases.push("PLEASE IMPLEMENT THIS PLAN");
  }
  if (/진행해|진행해줘/.test(userText)) {
    phrases.push("진행해줘");
  }
  if (/어떤 것 같아|어떻게 생각/.test(userText)) {
    phrases.push("어떤 것 같아?");
  }
  if (phrases.length > 0) {
    return phrases;
  }
  return [language === "ko" ? "계획을 먼저 주고 구현을 요청하는 구조" : "Plan-first implementation requests"];
}

function buildFallbackDefaultRewrite(bundle: PromptHabitBundle, language: "en" | "ko", firstUserText: string): string {
  const tests = bundle.evidence.observedTestCommands.slice(0, 2);
  const constraint = bundle.evidence.lateConstraints[0] ?? bundle.evidence.userCorrections[0];
  if (language === "ko") {
    return [
      truncate(firstUserText, 180),
      "",
      "다만 처음부터 기준을 이렇게 잡고 가자.",
      "- 원하는 결과물이 보고서인지, 코치 문장인지 먼저 판단해줘.",
      constraint ? `- 이 조건은 시작부터 반영해줘: "${truncate(constraint, 120)}"` : "- 범위가 커지면 바로 멈추고 물어봐줘.",
      tests.length > 0 ? `- 끝나기 전에 ${tests.map(formatCode).join(", ")}를 확인해줘.` : "- 끝나기 전에 관련 테스트/타입체크/빌드를 확인해줘."
    ].join("\n");
  }

  return [
    truncate(firstUserText, 180),
    "",
    "Before implementing, lock the product bar first.",
    "- Decide whether the output should be a report or a coachable sentence.",
    constraint ? `- Preserve this constraint from the start: "${truncate(constraint, 120)}"` : "- If the scope grows, stop and ask first.",
    tests.length > 0 ? `- Before finishing, run ${tests.map(formatCode).join(", ")}.` : "- Before finishing, run the relevant tests/typecheck/build."
  ].join("\n");
}

function fallbackWhyRelevant(issue: string, language: "en" | "ko"): string {
  const labels: Record<string, { en: string; ko: string }> = {
    user_correction: { en: "It contains a mid-session correction.", ko: "중간에 방향을 다시 잡은 흔적이 있습니다." },
    late_constraint: { en: "It contains a late-arriving constraint.", ko: "중요한 조건이 뒤늦게 나온 흔적이 있습니다." },
    repeated_failure: { en: "It contains repeated command or test failure.", ko: "명령이나 테스트 실패가 반복된 흔적이 있습니다." },
    verification_gap: { en: "It may be missing final verification.", ko: "마지막 확인이 부족했던 흔적이 있습니다." },
    scope_drift: { en: "The work appears to have spread beyond the first request.", ko: "처음 요청보다 범위가 넓어진 흔적이 있습니다." },
    file_churn: { en: "It contains repeated file edits.", ko: "여러 파일을 오가며 수정한 흔적이 있습니다." },
    premature_edit: { en: "Edits may have started before enough inspection.", ko: "충분히 살피기 전에 수정이 시작된 흔적이 있습니다." },
    environment_gap: { en: "Environment details may have blocked progress.", ko: "환경 조건이 빠졌던 흔적이 있습니다." },
    low_friction: { en: "It is useful as a lower-friction comparison.", ko: "덜 꼬인 비교 사례로 볼 수 있습니다." }
  };
  return labels[issue]?.[language] ?? (language === "ko" ? "습관 판단의 근거로 볼 수 있습니다." : "It supports the habit profile.");
}

function hasUserLanguageAnchor(text: string, bundle: PromptHabitBundle): boolean {
  const tokens = bundle.userMessages
    .flatMap((message) => message.text.match(/[가-힣]{2,}|[A-Za-z][A-Za-z0-9_-]{3,}/g) ?? [])
    .filter((token) => !/^(this|that|with|from|have|will|should|please|합니다|그리고|하지만)$/i.test(token))
    .slice(0, 120);
  if (tokens.length === 0) {
    return true;
  }
  return tokens.some((token) => text.includes(token));
}

function formatCode(value: string): string {
  return `\`${value}\``;
}

function habitAnalyzerTimeoutMs(): number {
  const configured = Number(process.env.RE_PROMPT_ANALYZER_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 60_000;
}

function preview(value: string): string {
  return value.length > 240 ? `${value.slice(0, 239)}…` : value;
}
