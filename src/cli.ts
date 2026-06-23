import { existsSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";
import { execa } from "execa";
import { ClaudeCliAnalyzer, CodexCliAnalyzer } from "./analyzers/cliAnalyzer.js";
import { assertHeuristicOnlyEngine, parseEngine, type Engine } from "./analyzers/engine.js";
import { HeuristicOnlyAnalyzer } from "./analyzers/heuristicOnlyAnalyzer.js";
import {
  buildFallbackPromptCoachReport,
  ClaudePromptCoachAnalyzer,
  CodexPromptCoachAnalyzer,
  lintPromptCoachReport,
  withCoachAnalysis
} from "./analyzers/promptCoachAnalyzer.js";
import { buildPromptCoachBundle } from "./core/coach/buildPromptCoachBundle.js";
import { buildEvidenceBundle } from "./core/evidence/buildEvidenceBundle.js";
import { redactValue } from "./core/privacy/redact.js";
import { lintRetroReport } from "./core/reportQuality.js";
import { computeFrictionScore } from "./core/scoring/frictionScore.js";
import { extractSignals } from "./core/signals/index.js";
import type { EvidenceBundle, NormalizedSession, PromptCoachBundle, PromptCoachReport, RetroReport, SessionSignal } from "./core/types.js";
import { renderMarkdownReport } from "./renderers/markdownRenderer.js";
import { renderPromptCoachReport } from "./renderers/promptCoachRenderer.js";
import { generateAgentsMdPatch } from "./rules/agentsMdPatch.js";
import {
  defaultCodexHome,
  locateCodexSessions,
  resolveSessionReference,
  type SessionCandidate
} from "./sources/codex/locateCodexSessions.js";
import { normalizeCodexSession } from "./sources/codex/normalizeCodexSession.js";
import { parseCodexJsonl } from "./sources/codex/parseCodexJsonl.js";

type Format = "md" | "json";
type NextStyle = "cli" | "plugin";
type GoLanguageOption = "auto" | "en" | "ko";
type GoLanguage = "en" | "ko";
const DEFAULT_MAX_TRANSCRIPT_BYTES = 50 * 1024 * 1024;

interface ScanRow {
  score: number;
  sessionId: string;
  turns: number;
  mainIssue: string;
  path: string;
}

interface AnalyzeResult {
  session: NormalizedSession;
  signals: SessionSignal[];
  bundle: EvidenceBundle;
  report: RetroReport;
}

interface CoachResult {
  session: NormalizedSession;
  signals: SessionSignal[];
  bundle: PromptCoachBundle;
  report: PromptCoachReport;
}

export function createProgram(): Command {
  const program = new Command()
    .name("re-prompt")
    .description("A local-first Codex session prompt coach.")
    .version("0.3.1");

  program
    .command("doctor")
    .description("Check local Codex and re-prompt prerequisites.")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .action(async (options) => {
      await doctorCommand({ codexHome: options.codexHome });
    });

  program
    .command("go")
    .description("Guide a first re-prompt run against recent Codex sessions.")
    .option("--since <range>", "Time range such as 30d or 2026-06-01", "30d")
    .option("--top <count>", "Maximum sessions to show", "5")
    .option("--next-style <style>", "Next command style: cli or plugin", "cli")
    .option("--language <language>", "Output language: auto, en, or ko", "auto")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Filter by repo/cwd")
    .action(async (options) => {
      await goCommand({
        since: options.since,
        top: Number(options.top),
        nextStyle: parseNextStyle(options.nextStyle),
        language: parseGoLanguage(options.language),
        codexHome: options.codexHome,
        repo: options.repo
      });
    });

  program
    .command("scan")
    .description("Rank recent Codex sessions by local friction signals.")
    .option("--since <range>", "Time range such as 7d or 2026-06-01", "7d")
    .option("--top <count>", "Maximum rows to print", "10")
    .option("--engine <engine>", "Scan is heuristic-only; use none.", "none")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Filter by repo/cwd")
    .option("--format <format>", "table or json", "table")
    .action(async (options) => {
      assertHeuristicOnlyEngine(options.engine, "scan");
      await scanCommand({
        since: options.since,
        top: Number(options.top),
        codexHome: options.codexHome,
        repo: options.repo,
        format: options.format
      });
    });

  program
    .command("coach [session-id-or-path]")
    .description("Coach a prompt from a Codex session in the user's own voice.")
    .option("--engine <engine>", "Analysis engine: codex, claude, or none", "codex")
    .option("--language <language>", "Output language: auto, en, or ko", "auto")
    .option("--format <format>", "md or json", "md")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Filter latest session by repo/cwd")
    .action(async (reference, options) => {
      await coachCommand(reference, {
        engine: parseEngine(options.engine),
        language: parseGoLanguage(options.language),
        format: parseFormat(options.format),
        codexHome: options.codexHome,
        repo: options.repo
      });
    });

  program
    .command("last")
    .description("Analyze the latest Codex stored rollout session.")
    .option("--engine <engine>", "Analysis engine: none, codex, or claude", "none")
    .option("--format <format>", "md or json", "md")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Filter by repo/cwd")
    .action(async (options) => {
      await lastCommand({
        engine: parseEngine(options.engine),
        codexHome: options.codexHome,
        repo: options.repo,
        format: parseFormat(options.format)
      });
    });

  program
    .command("retro <session-id-or-path>")
    .description("Analyze a Codex session by id or path.")
    .option("--engine <engine>", "Analysis engine: none, codex, or claude", "none")
    .option("--format <format>", "md or json", "md")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .action(async (reference, options) => {
      const engine = parseEngine(options.engine);
      const candidate = await resolveSessionReference(reference, { codexHome: options.codexHome });
      await retroCommand(candidate.transcriptPath, { engine, format: parseFormat(options.format) });
    });

  program
    .command("inspect <session-path>")
    .description("Print normalized session JSON for parser debugging.")
    .option("--format <format>", "json", "json")
    .action(async (sessionPath, options) => {
      if (options.format !== "json") {
        throw new Error("inspect currently supports only --format json.");
      }
      const session = await loadNormalizedSession(sessionPath);
      console.log(JSON.stringify(session, null, 2));
    });

  program
    .command("rules")
    .description("Generate a dry-run AGENTS.md patch from recent sessions.")
    .option("--since <range>", "Time range such as 30d or 2026-06-01", "30d")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Target repo root", process.cwd())
    .option("--max-rules <count>", "Maximum rules", "5")
    .option("--apply", "Out of scope for this release")
    .action(async (options) => {
      if (options.apply) {
        throw new Error("--apply is intentionally out of scope for this release. Dry-run only.");
      }
      await rulesCommand({
        since: options.since,
        codexHome: options.codexHome,
        repo: options.repo,
        maxRules: Number(options.maxRules)
      });
    });

  return program;
}

async function doctorCommand(options: { codexHome?: string }): Promise<void> {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const sessionsDir = resolve(codexHome, "sessions");
  const codex = await execa("bash", ["-lc", "command -v codex"], { reject: false });
  const sessions = await locateCodexSessions({ codexHome });
  const maxTranscriptBytes = getMaxTranscriptBytes();
  const largest = sessions.reduce<(typeof sessions)[number] | undefined>(
    (current, session) => (!current || session.sizeBytes > current.sizeBytes ? session : current),
    undefined
  );

  console.log("re-prompt doctor");
  console.log("");
  console.log(formatCheck(codex.exitCode === 0, `codex binary: ${codex.stdout || "not found"}`));
  console.log(formatCheck(existsSync(codexHome), `CODEX_HOME: ${codexHome}`));
  console.log(formatCheck(existsSync(sessionsDir), `sessions directory: ${sessionsDir}`));
  console.log(formatCheck(true, `found sessions: ${sessions.length}`));
  if (largest) {
    const warning =
      largest.sizeBytes > maxTranscriptBytes
        ? ` (${formatBytes(largest.sizeBytes)}; larger than scan limit ${formatBytes(maxTranscriptBytes)})`
        : ` (${formatBytes(largest.sizeBytes)})`;
    console.log(formatCheck(largest.sizeBytes <= maxTranscriptBytes, `largest session: ${largest.transcriptPath}${warning}`));
  }
  console.log(formatCheck(existsSync(resolve(process.cwd(), "AGENTS.md")), `repo AGENTS.md: ${resolve(process.cwd(), "AGENTS.md")}`));
  console.log("");
  console.log("coach: codex by default; scan/go/rules use local heuristic triage");
}

async function goCommand(options: {
  since: string;
  top: number;
  nextStyle: NextStyle;
  language: GoLanguageOption;
  codexHome?: string;
  repo?: string;
}): Promise<void> {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const sessionsDir = resolve(codexHome, "sessions");
  const maxTranscriptBytes = getMaxTranscriptBytes();
  const language = resolveGoLanguage(options.language);
  const sessions = await locateCodexSessions({ codexHome, repoPath: options.repo });
  const largest = sessions.reduce<SessionCandidate | undefined>(
    (current, session) => (!current || session.sizeBytes > current.sizeBytes ? session : current),
    undefined
  );

  console.log("re-prompt go");
  console.log("");

  if (sessions.length === 0) {
    printGoNoSessions(language, codexHome, sessionsDir);
    return;
  }

  const rows = await collectScanRows({
    since: options.since,
    top: Math.max(Number.isFinite(options.top) ? options.top : 5, 1),
    codexHome,
    repo: options.repo
  });

  if (rows.length === 0) {
    printGoNoRecentRows(language, options.since);
    return;
  }

  printGoSummary({
    language,
    sessionsCount: sessions.length,
    since: options.since,
    rows,
    largest,
    maxTranscriptBytes,
    codexHome,
    sessionsDir,
    nextStyle: options.nextStyle
  });
}

function printGoNoSessions(language: GoLanguage, codexHome: string, sessionsDir: string): void {
  if (language === "ko") {
    console.log("아직 Codex 작업 기록을 찾지 못했습니다.");
    console.log("");
    console.log("Codex로 코딩 작업을 한 번 실행한 뒤 다시 `re-prompt go`를 실행하세요.");
    console.log("문제가 계속되면 `re-prompt doctor`로 저장 위치를 확인할 수 있습니다.");
    console.log("");
    console.log("확인한 위치:");
    console.log(`- CODEX_HOME: ${codexHome}`);
    console.log(`- sessions: ${sessionsDir}`);
    return;
  }

  console.log("No local Codex session history was found yet.");
  console.log("");
  console.log("Run Codex on a coding task first, then come back and run `re-prompt go` again.");
  console.log("For diagnostics, run `re-prompt doctor`.");
  console.log("");
  console.log("Checked locations:");
  console.log(`- CODEX_HOME: ${codexHome}`);
  console.log(`- sessions: ${sessionsDir}`);
}

function printGoNoRecentRows(language: GoLanguage, since: string): void {
  if (language === "ko") {
    console.log(`최근 범위(--since ${since})에서 회고할 Codex 작업을 찾지 못했습니다.`);
    console.log("더 넓게 보려면 `re-prompt scan --since 90d`를 실행하거나, 최근 작업은 `re-prompt coach`로 확인하세요.");
    return;
  }

  console.log(`No recent Codex sessions matched --since ${since}.`);
  console.log("Try `re-prompt scan --since 90d` or `re-prompt coach`.");
}

function printGoSummary(options: {
  language: GoLanguage;
  sessionsCount: number;
  since: string;
  rows: ScanRow[];
  largest?: SessionCandidate;
  maxTranscriptBytes: number;
  codexHome: string;
  sessionsDir: string;
  nextStyle: NextStyle;
}): void {
  const top = options.rows[0]!;
  if (options.language === "ko") {
    console.log(`최근 Codex 작업 기록 ${options.sessionsCount}개를 찾았습니다.`);
    console.log(`최근 ${options.since} 기준으로 대략 먼저 봐도 좋을 작업입니다.`);
    console.log("");
    console.log("- 작업 ID: " + top.sessionId);
    console.log(`- 꼬였을 가능성: ${goPriorityLabel(top.score, "ko")} (${top.score}/100)`);
    console.log(`- 대화/작업 횟수: ${top.turns}`);
    console.log(`- 주요 패턴: ${goIssueLabel(top.mainIssue, "ko")}`);
    console.log("- 선별 방식: 빠른 로컬 규칙으로 후보만 고름");
    printGoOtherRows(options.rows, "ko");
    printGoLargestWarning(options.largest, options.maxTranscriptBytes, "ko");
    console.log("");
    console.log("다음에 해볼 것:");
    printGoNextCommands(top.sessionId, options.nextStyle, "ko");
    console.log("");
    console.log("확인한 위치:");
    console.log(`- CODEX_HOME: ${options.codexHome}`);
    console.log(`- sessions: ${options.sessionsDir}`);
    return;
  }

  console.log(`Found ${options.sessionsCount} local Codex sessions.`);
  console.log(`A rough first session to inspect from the last ${options.since}:`);
  console.log("");
  console.log("- Session: " + top.sessionId);
  console.log(`- Review priority: ${goPriorityLabel(top.score, "en")} (${top.score}/100)`);
  console.log(`- Conversation length: ${top.turns} turns`);
  console.log(`- Main pattern: ${goIssueLabel(top.mainIssue, "en")}`);
  console.log("- Triage mode: local rules only for candidate selection");
  printGoOtherRows(options.rows, "en");
  printGoLargestWarning(options.largest, options.maxTranscriptBytes, "en");
  console.log("");
  console.log("Next commands:");
  printGoNextCommands(top.sessionId, options.nextStyle, "en");
  console.log("");
  console.log("Checked locations:");
  console.log(`- CODEX_HOME: ${options.codexHome}`);
  console.log(`- sessions: ${options.sessionsDir}`);
}

function printGoOtherRows(rows: ScanRow[], language: GoLanguage): void {
  const others = rows.slice(1);
  if (others.length === 0) {
    return;
  }
  console.log("");
  console.log(language === "ko" ? "다른 후보:" : "Other candidates:");
  for (const row of others) {
    if (language === "ko") {
      console.log(`- ${row.sessionId}: ${goPriorityLabel(row.score, "ko")} · ${goIssueLabel(row.mainIssue, "ko")}`);
    } else {
      console.log(`- ${row.sessionId}: ${goPriorityLabel(row.score, "en")} · ${goIssueLabel(row.mainIssue, "en")}`);
    }
  }
}

function printGoLargestWarning(largest: SessionCandidate | undefined, maxTranscriptBytes: number, language: GoLanguage): void {
  if (!largest || largest.sizeBytes <= maxTranscriptBytes) {
    return;
  }
  const path = redactValue(largest.transcriptPath).value;
  console.log("");
  if (language === "ko") {
    console.log(
      `참고: 너무 큰 작업 기록 하나는 메모리 보호를 위해 건너뜁니다: ${path} (${formatBytes(largest.sizeBytes)}, 제한 ${formatBytes(maxTranscriptBytes)})`
    );
    return;
  }
  console.log(
    `Note: one very large session is skipped to protect memory: ${path} (${formatBytes(largest.sizeBytes)}, limit ${formatBytes(maxTranscriptBytes)})`
  );
}

function printGoNextCommands(sessionId: string, nextStyle: NextStyle, language: GoLanguage): void {
  if (nextStyle === "plugin") {
    if (language === "ko") {
      console.log(`- 이 작업 자세히 보기: /re-prompt-retro ${sessionId}`);
      console.log("- 가장 최근 작업 빠르게 보기: /re-prompt-last");
      console.log("- 반복 패턴을 AGENTS.md 규칙 후보로 보기: /re-prompt-rules");
      return;
    }
    console.log(`- Review this session: /re-prompt-retro ${sessionId}`);
    console.log("- Quick latest-session report: /re-prompt-last");
    console.log("- Preview durable repo rules: /re-prompt-rules");
    return;
  }

  if (language === "ko") {
    console.log(`- 이 작업을 prompt coach로 보기: re-prompt coach ${sessionId}`);
    console.log("- 가장 최근 작업을 prompt coach로 보기: re-prompt coach");
    console.log("- 반복 패턴을 AGENTS.md 규칙 후보로 보기: re-prompt rules --since 30d");
    return;
  }
  console.log(`- Coach this session: re-prompt coach ${sessionId}`);
  console.log("- Coach the latest session: re-prompt coach");
  console.log("- Preview durable repo rules: re-prompt rules --since 30d");
}

function goPriorityLabel(score: number, language: GoLanguage): string {
  if (score <= 0) {
    return language === "ko" ? "건너뜀" : "skipped";
  }
  if (score >= 80) {
    return language === "ko" ? "매우 높음" : "very high";
  }
  if (score >= 55) {
    return language === "ko" ? "높음" : "high";
  }
  if (score >= 30) {
    return language === "ko" ? "중간" : "medium";
  }
  return language === "ko" ? "낮음" : "low";
}

function goIssueLabel(issue: string, language: GoLanguage): string {
  const labels: Record<string, { en: string; ko: string }> = {
    user_correction: { en: "User had to redirect the session", ko: "사용자가 방향을 다시 잡아줌" },
    late_constraint: { en: "Important constraint arrived mid-session", ko: "중요한 조건이 작업 중간에 나옴" },
    repeated_failure: { en: "Same command or test failed repeatedly", ko: "같은 명령/테스트 실패가 반복됨" },
    verification_gap: { en: "Missing final verification", ko: "마지막 확인 명령이 부족함" },
    scope_drift: { en: "Work spread beyond the original scope", ko: "작업 범위가 넓어짐" },
    file_churn: { en: "Repeated file edits", ko: "파일을 여러 번 고치며 왕복함" },
    premature_edit: { en: "Files changed before enough inspection", ko: "충분히 살피기 전에 파일을 고침" },
    environment_gap: { en: "Environment or setup issue", ko: "환경 설정/실행 조건에서 막힘" },
    too_large: { en: "Too large to scan safely", ko: "너무 커서 안전하게 건너뜀" },
    low_friction: { en: "No strong friction pattern", ko: "크게 꼬인 흔적은 적음" }
  };
  return labels[issue]?.[language] ?? issue.replaceAll("_", " ");
}

async function scanCommand(options: {
  since: string;
  top: number;
  codexHome?: string;
  repo?: string;
  format: string;
}): Promise<void> {
  const topRows = await collectScanRows(options);
  if (options.format === "json") {
    console.log(JSON.stringify(topRows, null, 2));
    return;
  }

  printScanTable(topRows);
}

async function collectScanRows(options: {
  since: string;
  top: number;
  codexHome?: string;
  repo?: string;
}): Promise<ScanRow[]> {
  const since = parseSince(options.since);
  const maxTranscriptBytes = getMaxTranscriptBytes();
  const sessions = (await locateCodexSessions({ codexHome: options.codexHome, repoPath: options.repo })).filter(
    (session) => !since || session.mtimeMs >= since.getTime()
  );
  const rows: ScanRow[] = [];

  for (const candidate of sessions.slice(0, Math.max(options.top, 1) * 3)) {
    if (candidate.sizeBytes > maxTranscriptBytes) {
      rows.push({
        score: 0,
        sessionId: candidate.sessionId,
        turns: 0,
        mainIssue: "too_large",
        path: candidate.transcriptPath
      });
      continue;
    }
    const session = await loadNormalizedSession(candidate.transcriptPath);
    const signals = extractSignals(session);
    const score = computeFrictionScore(session, signals);
    rows.push({
      score,
      sessionId: session.sessionId,
      turns: session.turns.length,
      mainIssue: signals[0]?.kind ?? "low_friction",
      path: session.transcriptPath
    });
  }

  return rows.sort((a, b) => b.score - a.score).slice(0, options.top);
}

function printScanTable(rows: ScanRow[]): void {
  console.log("Friction  Session                              Turns  Main issue");
  for (const row of rows) {
    console.log(`${String(row.score).padEnd(9)} ${row.sessionId.slice(0, 34).padEnd(36)} ${String(row.turns).padEnd(6)} ${row.mainIssue}`);
  }
}

async function retroCommand(path: string, options: { engine: Engine; format: Format }): Promise<void> {
  const result = await analyzeSession(path, options.engine);
  result.report.selection = {
    command: "retro",
    source: "codex",
    sessionId: result.session.sessionId,
    transcriptPath: result.session.transcriptPath,
    selectedBecause: "explicit session reference",
    startedAt: result.session.startedAt,
    turnsAnalyzed: result.session.turns.length,
    confidence: "high"
  };
  printReport(result.report, options.format);
}

async function coachCommand(
  reference: string | undefined,
  options: {
    engine: Engine;
    language: GoLanguageOption;
    format: Format;
    codexHome?: string;
    repo?: string;
  }
): Promise<void> {
  const language = resolveGoLanguage(options.language);
  if (reference) {
    const candidate = await resolveSessionReference(reference, { codexHome: options.codexHome });
    const result = await analyzeCoachSession(candidate.transcriptPath, { engine: options.engine, language });
    printCoachReport(result.report, options.format);
    return;
  }

  const sessions = await locateCodexSessions({ codexHome: options.codexHome, repoPath: options.repo });
  if (sessions.length === 0) {
    throw new Error("No Codex sessions found. Run `re-prompt doctor` for diagnostics.");
  }

  const skipped = { tooLarge: 0, parseFailed: 0, other: 0 };
  const maxTranscriptBytes = getMaxTranscriptBytes();
  for (const candidate of sessions) {
    if (candidate.sizeBytes > maxTranscriptBytes) {
      skipped.tooLarge += 1;
      continue;
    }
    try {
      const result = await analyzeCoachSession(candidate.transcriptPath, { engine: options.engine, language });
      printCoachReport(result.report, options.format);
      return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        skipped.parseFailed += 1;
      } else {
        skipped.other += 1;
      }
    }
  }

  throw new Error(
    `No analyzable Codex sessions found. Skipped newer sessions: ${skipped.tooLarge} too_large, ${skipped.parseFailed} parse_failed, ${skipped.other} other.`
  );
}

function printCoachReport(report: PromptCoachReport, format: Format): void {
  const redacted = redactValue(report).value;
  if (format === "json") {
    console.log(JSON.stringify(redacted, null, 2));
    return;
  }
  console.log(renderPromptCoachReport(redacted));
}

function printReport(report: RetroReport, format: Format): void {
  const redacted = redactValue(report).value;
  if (format === "json") {
    console.log(JSON.stringify(redacted, null, 2));
    return;
  }
  console.log(renderMarkdownReport(redacted));
}

async function lastCommand(options: {
  engine: Engine;
  codexHome?: string;
  repo?: string;
  format: Format;
}): Promise<void> {
  const sessions = await locateCodexSessions({ codexHome: options.codexHome, repoPath: options.repo });
  if (sessions.length === 0) {
    throw new Error("No Codex sessions found. Run `re-prompt doctor` for diagnostics.");
  }

  const skipped = { tooLarge: 0, parseFailed: 0, other: 0 };
  const maxTranscriptBytes = getMaxTranscriptBytes();
  for (const candidate of sessions) {
    if (candidate.sizeBytes > maxTranscriptBytes) {
      skipped.tooLarge += 1;
      continue;
    }

    try {
      const result = await analyzeSession(candidate.transcriptPath, options.engine);
      result.report.selection = buildLastSelection(result, candidate, skipped, options.repo);
      printReport(result.report, options.format);
      return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        skipped.parseFailed += 1;
      } else {
        skipped.other += 1;
      }
    }
  }

  throw new Error(
    `No analyzable Codex sessions found. Skipped newer sessions: ${skipped.tooLarge} too_large, ${skipped.parseFailed} parse_failed, ${skipped.other} other.`
  );
}

async function rulesCommand(options: {
  since: string;
  codexHome?: string;
  repo: string;
  maxRules: number;
}): Promise<void> {
  const since = parseSince(options.since);
  const maxTranscriptBytes = getMaxTranscriptBytes();
  const sessions = (await locateCodexSessions({ codexHome: options.codexHome })).filter(
    (session) => !since || session.mtimeMs >= since.getTime()
  );
  const bundles: EvidenceBundle[] = [];
  for (const candidate of sessions.slice(0, 50)) {
    if (candidate.sizeBytes > maxTranscriptBytes) {
      continue;
    }
    const analysis = await analyzeSession(candidate.transcriptPath, "none");
    bundles.push(analysis.bundle);
  }
  const patch = await generateAgentsMdPatch({
    repoRoot: resolve(options.repo),
    bundles,
    maxRules: options.maxRules
  });
  console.log(patch.diff || "No AGENTS.md rule changes suggested.");
}

async function analyzeSession(path: string, engine: Engine): Promise<AnalyzeResult> {
  const session = await loadNormalizedSession(path);
  const signals = extractSignals(session);
  const bundle = buildEvidenceBundle(session, signals);
  const redacted = redactValue(bundle);
  const redactedBundle = {
    ...redacted.value,
    privacy: {
      redactionApplied: redacted.redactionCount > 0,
      redactionCount: redacted.redactionCount
    }
  };
  const report = await analyzeBundle(redactedBundle, engine);
  return { session, signals, bundle: redactedBundle, report };
}

async function analyzeCoachSession(
  path: string,
  options: { engine: Engine; language: GoLanguage }
): Promise<CoachResult> {
  const session = await loadNormalizedSession(path);
  const signals = extractSignals(session);
  const evidenceBundle = buildEvidenceBundle(session, signals);
  const coachBundle = buildPromptCoachBundle(session, evidenceBundle, { language: options.language });
  const redacted = redactValue(coachBundle);
  const redactedBundle = {
    ...redacted.value,
    privacy: {
      redactionApplied: redacted.redactionCount > 0,
      redactionCount: redacted.redactionCount
    }
  };
  const report = await analyzeCoachBundle(redactedBundle, options.engine, options.language);
  return { session, signals, bundle: redactedBundle, report };
}

async function analyzeBundle(bundle: EvidenceBundle, engine: Engine): Promise<RetroReport> {
  const heuristicAnalyzer = new HeuristicOnlyAnalyzer();
  if (engine === "none") {
    const report = await heuristicAnalyzer.analyze(bundle, { engine });
    return withAnalysis(report, { requestedEngine: "none", usedEngine: "none", fallback: false });
  }

  try {
    const analyzer = engine === "codex" ? new CodexCliAnalyzer() : new ClaudeCliAnalyzer();
    const report = await analyzer.analyze(bundle, { engine });
    const issues = lintRetroReport(report, bundle).filter((issue) => issue.severity === "error");
    if (issues.length > 0) {
      throw new Error(`Analyzer report failed quality checks: ${issues.map((issue) => issue.kind).join(", ")}`);
    }
    return withAnalysis(report, { requestedEngine: engine, usedEngine: engine, fallback: false });
  } catch (error) {
    const report = await heuristicAnalyzer.analyze(bundle, { engine: "none" });
    return withAnalysis(report, {
      requestedEngine: engine,
      usedEngine: "none",
      fallback: true,
      fallbackReason: error instanceof Error ? error.message : String(error)
    });
  }
}

async function analyzeCoachBundle(
  bundle: PromptCoachBundle,
  engine: Engine,
  language: GoLanguage
): Promise<PromptCoachReport> {
  if (engine === "none") {
    return buildFallbackPromptCoachReport(bundle, { engine, language, fallback: false });
  }

  try {
    const analyzer = engine === "codex" ? new CodexPromptCoachAnalyzer() : new ClaudePromptCoachAnalyzer();
    const report = await analyzer.analyze(bundle, { engine, language });
    const issues = lintPromptCoachReport(report, bundle);
    if (issues.length > 0) {
      throw new Error(`Coach report failed quality checks: ${issues.join(", ")}`);
    }
    return withCoachAnalysis(report, { requestedEngine: engine, usedEngine: engine, fallback: false });
  } catch (error) {
    return buildFallbackPromptCoachReport(bundle, {
      engine,
      language,
      fallback: true,
      fallbackReason: error instanceof Error ? error.message : String(error)
    });
  }
}

function withAnalysis(report: RetroReport, analysis: NonNullable<RetroReport["analysis"]>): RetroReport {
  return {
    ...report,
    analysis
  };
}

function buildLastSelection(
  result: AnalyzeResult,
  candidate: SessionCandidate,
  skipped: { tooLarge: number; parseFailed: number; other: number },
  repo?: string
): RetroReport["selection"] {
  const repoMatches = repo && candidate.cwd ? resolve(candidate.cwd) === resolve(repo) : false;
  return {
    command: "last",
    source: "codex",
    sessionId: result.session.sessionId,
    transcriptPath: candidate.transcriptPath,
    selectedBecause: "most recent analyzable session",
    startedAt: candidate.startedAt ?? result.session.startedAt,
    turnsAnalyzed: result.session.turns.length,
    skippedNewerSessions: skipped,
    confidence: repoMatches ? "high" : "low",
    confidenceReason: repoMatches
      ? "The session cwd matched the requested repository filter."
      : "re-prompt could not confirm this session belongs to the current repository. Use --repo or retro <path> for a specific session."
  };
}

async function loadNormalizedSession(path: string): Promise<NormalizedSession> {
  const fileStat = await stat(path);
  const maxTranscriptBytes = getMaxTranscriptBytes();
  if (fileStat.size > maxTranscriptBytes) {
    throw new Error(
      `Session transcript is too large for this release (${formatBytes(fileStat.size)} > ${formatBytes(maxTranscriptBytes)}): ${path}`
    );
  }
  const content = await readFile(path, "utf8");
  const parsed = parseCodexJsonl(content);
  return normalizeCodexSession(parsed, { transcriptPath: path });
}

function getMaxTranscriptBytes(): number {
  const configured = process.env.RE_PROMPT_MAX_TRANSCRIPT_BYTES;
  if (!configured) {
    return DEFAULT_MAX_TRANSCRIPT_BYTES;
  }
  const parsed = Number(configured);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_TRANSCRIPT_BYTES;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

function parseSince(value: string): Date | undefined {
  const dayMatch = value.match(/^(\d+)d$/i);
  if (dayMatch) {
    const days = Number(dayMatch[1]);
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseFormat(format: string): Format {
  if (format === "md" || format === "json") {
    return format;
  }
  throw new Error(`Unsupported format "${format}". Use md or json.`);
}

function parseNextStyle(style: string): NextStyle {
  if (style === "cli" || style === "plugin") {
    return style;
  }
  throw new Error(`Unsupported next command style "${style}". Use cli or plugin.`);
}

function parseGoLanguage(language: string): GoLanguageOption {
  if (language === "auto" || language === "en" || language === "ko") {
    return language;
  }
  throw new Error(`Unsupported language "${language}". Use auto, en, or ko.`);
}

function resolveGoLanguage(language: GoLanguageOption): GoLanguage {
  if (language === "en" || language === "ko") {
    return language;
  }
  const locale = [process.env.RE_PROMPT_LANG, process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return locale.split(/\s+/).some((value) => value === "ko" || value.startsWith("ko_") || value.startsWith("ko-")) ? "ko" : "en";
}

function formatCheck(ok: boolean, text: string): string {
  return `${ok ? pc.green("✓") : pc.yellow("!")} ${text}`;
}

async function main(): Promise<void> {
  try {
    await createProgram().parseAsync(process.argv);
  } catch (error) {
    console.error(pc.red(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
const currentPath = fileURLToPath(import.meta.url);
if (sameFilePath(invokedPath, currentPath) || dirname(invokedPath).endsWith("src")) {
  void main();
}

function sameFilePath(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return resolve(left) === resolve(right);
  }
}
