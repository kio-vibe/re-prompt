import { existsSync, realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "@commander-js/extra-typings";
import pc from "picocolors";
import { execa } from "execa";
import { HeuristicOnlyAnalyzer } from "./analyzers/heuristicOnlyAnalyzer.js";
import { buildEvidenceBundle } from "./core/evidence/buildEvidenceBundle.js";
import { redactValue } from "./core/privacy/redact.js";
import { computeFrictionScore } from "./core/scoring/frictionScore.js";
import { extractSignals } from "./core/signals/index.js";
import type { EvidenceBundle, NormalizedSession, RetroReport, SessionSignal } from "./core/types.js";
import { renderMarkdownReport } from "./renderers/markdownRenderer.js";
import { generateAgentsMdPatch } from "./rules/agentsMdPatch.js";
import {
  defaultCodexHome,
  locateCodexSessions,
  resolveSessionReference,
  type SessionCandidate
} from "./sources/codex/locateCodexSessions.js";
import { normalizeCodexSession } from "./sources/codex/normalizeCodexSession.js";
import { parseCodexJsonl } from "./sources/codex/parseCodexJsonl.js";

type Engine = "none";
type Format = "md" | "json";
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

export function createProgram(): Command {
  const program = new Command()
    .name("re-prompt")
    .description("A local-first Codex session postmortem CLI.")
    .version("0.1.3");

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
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Filter by repo/cwd")
    .action(async (options) => {
      await goCommand({
        since: options.since,
        top: Number(options.top),
        codexHome: options.codexHome,
        repo: options.repo
      });
    });

  program
    .command("scan")
    .description("Rank recent Codex sessions by local friction signals.")
    .option("--since <range>", "Time range such as 7d or 2026-06-01", "7d")
    .option("--top <count>", "Maximum rows to print", "10")
    .option("--engine <engine>", "Analysis engine. This release supports only none.", "none")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Filter by repo/cwd")
    .option("--format <format>", "table or json", "table")
    .action(async (options) => {
      assertEngine(options.engine);
      await scanCommand({
        since: options.since,
        top: Number(options.top),
        codexHome: options.codexHome,
        repo: options.repo,
        format: options.format
      });
    });

  program
    .command("last")
    .description("Analyze the latest Codex stored rollout session.")
    .option("--engine <engine>", "Analysis engine. This release supports only none.", "none")
    .option("--format <format>", "md or json", "md")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .option("--repo <path>", "Filter by repo/cwd")
    .action(async (options) => {
      assertEngine(options.engine);
      await lastCommand({
        codexHome: options.codexHome,
        repo: options.repo,
        format: parseFormat(options.format)
      });
    });

  program
    .command("retro <session-id-or-path>")
    .description("Analyze a Codex session by id or path.")
    .option("--engine <engine>", "Analysis engine. This release supports only none.", "none")
    .option("--format <format>", "md or json", "md")
    .option("--codex-home <path>", "Override CODEX_HOME")
    .action(async (reference, options) => {
      assertEngine(options.engine);
      const candidate = await resolveSessionReference(reference, { codexHome: options.codexHome });
      await retroCommand(candidate.transcriptPath, { engine: "none", format: parseFormat(options.format) });
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
  console.log("analyzer: heuristic-only local mode");
}

async function goCommand(options: { since: string; top: number; codexHome?: string; repo?: string }): Promise<void> {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const sessionsDir = resolve(codexHome, "sessions");
  const maxTranscriptBytes = getMaxTranscriptBytes();
  const sessions = await locateCodexSessions({ codexHome, repoPath: options.repo });
  const largest = sessions.reduce<SessionCandidate | undefined>(
    (current, session) => (!current || session.sizeBytes > current.sizeBytes ? session : current),
    undefined
  );

  console.log("re-prompt go");
  console.log("");
  console.log(formatCheck(existsSync(codexHome), `CODEX_HOME: ${codexHome}`));
  console.log(formatCheck(existsSync(sessionsDir), `sessions directory: ${sessionsDir}`));
  console.log(formatCheck(sessions.length > 0, `found sessions: ${sessions.length}`));
  if (largest) {
    const warning =
      largest.sizeBytes > maxTranscriptBytes
        ? ` (${formatBytes(largest.sizeBytes)}; larger than scan limit ${formatBytes(maxTranscriptBytes)})`
        : ` (${formatBytes(largest.sizeBytes)})`;
    console.log(formatCheck(largest.sizeBytes <= maxTranscriptBytes, `largest session: ${largest.transcriptPath}${warning}`));
  }
  console.log("");

  if (sessions.length === 0) {
    console.log("No Codex sessions found yet.");
    console.log("Run Codex on a coding task first, then come back and run `re-prompt go` again.");
    console.log("For diagnostics, run `re-prompt doctor`.");
    return;
  }

  const rows = await collectScanRows({
    since: options.since,
    top: Math.max(Number.isFinite(options.top) ? options.top : 5, 1),
    codexHome,
    repo: options.repo
  });

  if (rows.length === 0) {
    console.log(`No recent Codex sessions matched --since ${options.since}.`);
    console.log("Try `re-prompt scan --since 90d` or `re-prompt last`.");
    return;
  }

  console.log(`Top sessions since ${options.since}:`);
  printScanTable(rows);
  console.log("");
  console.log("Next commands:");
  console.log(`- Analyze the top session: re-prompt retro ${rows[0]!.sessionId}`);
  console.log("- Quick latest-session report: re-prompt last");
  console.log("- Preview durable repo rules: re-prompt rules --since 30d");
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

function printReport(report: RetroReport, format: Format): void {
  const redacted = redactValue(report).value;
  if (format === "json") {
    console.log(JSON.stringify(redacted, null, 2));
    return;
  }
  console.log(renderMarkdownReport(redacted));
}

async function lastCommand(options: {
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
      const result = await analyzeSession(candidate.transcriptPath, "none");
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
  const report = await new HeuristicOnlyAnalyzer().analyze(redactedBundle, { engine });
  return { session, signals, bundle: redactedBundle, report };
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

function assertEngine(engine: string): asserts engine is Engine {
  if (engine !== "none") {
    throw new Error("This release supports only --engine none.");
  }
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
