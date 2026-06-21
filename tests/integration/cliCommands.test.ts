import { chmod, copyFile, mkdir, mkdtemp, readFile, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execa } from "execa";
import { fixturePath } from "../helpers.js";
import type { RetroReport } from "../../src/core/types.js";

async function makeCodexHomeWithSession(fixtureName: string): Promise<{ codexHome: string; sessionPath: string }> {
  const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-cli-codex-"));
  const day = join(codexHome, "sessions", "2026", "06", "20");
  await mkdir(day, { recursive: true });
  const sessionPath = join(day, `rollout-2026-06-20T02-00-00-${fixtureName}.jsonl`);
  await copyFile(fixturePath(fixtureName), sessionPath);
  return { codexHome, sessionPath };
}

async function runCli(args: string[]) {
  return execa("pnpm", ["exec", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env },
    reject: false
  });
}

async function runCliWithEnv(args: string[], env: NodeJS.ProcessEnv) {
  return execa("pnpm", ["exec", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    reject: false
  });
}

async function makeFakeAnalyzerBinary(name: "codex" | "claude"): Promise<string> {
  const binDir = await mkdtemp(join(tmpdir(), `re-prompt-fake-${name}-`));
  const binPath = join(binDir, name);
  await writeFile(
    binPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const stdin = fs.readFileSync(0, "utf8");
if (process.env.FAKE_ANALYZER_ARGS_FILE) fs.writeFileSync(process.env.FAKE_ANALYZER_ARGS_FILE, JSON.stringify(args));
if (process.env.FAKE_ANALYZER_STDIN_FILE) fs.writeFileSync(process.env.FAKE_ANALYZER_STDIN_FILE, stdin);
const mode = process.env.FAKE_ANALYZER_MODE || "ok";
if (mode === "sleep") setTimeout(() => {}, 10_000);
if (mode === "exit") process.exit(2);
const output = mode === "invalid" ? "not json" : (process.env.FAKE_ANALYZER_REPORT || "{}");
if (path.basename(process.argv[1]) === "codex") {
  const outputIndex = args.indexOf("--output-last-message");
  if (outputIndex === -1) process.exit(3);
  fs.writeFileSync(args[outputIndex + 1], output);
} else {
  console.log(JSON.stringify({ result: output }));
}
`,
    "utf8"
  );
  await chmod(binPath, 0o755);
  return binPath;
}

describe("CLI commands", () => {
  it("runs when invoked through a package-style bin symlink", async () => {
    const binDir = await mkdtemp(join(tmpdir(), "re-prompt-cli-bin-"));
    const linkPath = join(binDir, "re-prompt.ts");
    await symlink(join(process.cwd(), "src", "cli.ts"), linkPath);

    const result = await execa("pnpm", ["exec", "tsx", linkPath, "--version"], {
      cwd: process.cwd(),
      env: { ...process.env },
      reject: false
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("0.2.1");
  });

  it("prints doctor and scan output for a temp CODEX_HOME", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const doctor = await runCli(["doctor", "--codex-home", codexHome]);
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("sessions directory");

    const scan = await runCli(["scan", "--since", "7d", "--engine", "none", "--codex-home", codexHome]);
    expect(scan.exitCode).toBe(0);
    expect(scan.stdout).toContain("Friction");
    expect(scan.stdout).toContain("late_constraint");
  });

  it("guides a first run with scan rows and next commands", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--top", "3"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("re-prompt go");
    expect(result.stdout).toContain("found sessions: 1");
    expect(result.stdout).toContain("Friction");
    expect(result.stdout).toContain("late_constraint");
    expect(result.stdout).toContain("Next commands:");
    expect(result.stdout).toContain("re-prompt retro sess-late");
    expect(result.stdout).toContain("re-prompt last");
  });

  it("can guide plugin users with slash-command next steps", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--top", "3", "--next-style", "plugin"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Next commands:");
    expect(result.stdout).toContain("/re-prompt-retro sess-late");
    expect(result.stdout).toContain("/re-prompt-last");
    expect(result.stdout).toContain("/re-prompt-rules");
    expect(result.stdout).not.toContain("re-prompt retro sess-late");
  });

  it("rejects unsupported next command styles", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--next-style", "terminal"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported next command style "terminal"');
    expect(result.stderr).toContain("Use cli or plugin");
  });

  it("keeps plugin command guidance plugin-first and language-aware", async () => {
    const goCommand = await readFile("plugins/re-prompt/commands/re-prompt-go.md", "utf8");
    const installCommand = await readFile("plugins/re-prompt/commands/re-prompt-install.md", "utf8");
    const skill = await readFile("plugins/re-prompt/skills/re-prompt/SKILL.md", "utf8");

    expect(goCommand).toContain("re-prompt go --next-style plugin");
    expect(goCommand).toContain("/re-prompt-retro <session-id>");
    expect(installCommand).toContain("command -v re-prompt");
    expect(installCommand).toContain("Only inspect repository docs or plugin files if one of these checks fails");
    expect(skill).toContain("Respond in the user's language");
    expect(skill).toContain("Do not ask the user to paste raw rollout JSONL");
  });

  it("go handles an empty Codex home without failing", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-cli-empty-go-"));

    const result = await runCli(["go", "--codex-home", codexHome]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No Codex sessions found yet.");
    expect(result.stdout).toContain("Run Codex on a coding task first");
    expect(result.stdout).toContain("re-prompt doctor");
  });

  it("renders retro markdown and inspect JSON", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const retro = await runCli(["retro", sessionPath, "--engine", "none"]);
    expect(retro.exitCode).toBe(0);
    expect(retro.stdout).toContain("# re-prompt retro");
    expect(retro.stdout).toContain("Better initial prompt");

    const inspect = await runCli(["inspect", sessionPath, "--format", "json"]);
    expect(inspect.exitCode).toBe(0);
    expect(JSON.parse(inspect.stdout)).toMatchObject({ sessionId: "sess-late" });
  });

  it("invokes codex analyzer with safe non-interactive flags for retro", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const fakeCodex = await makeFakeAnalyzerBinary("codex");
    const argsFile = join(tmpdir(), `re-prompt-codex-args-${randomUUID()}.json`);
    const stdinFile = join(tmpdir(), `re-prompt-codex-stdin-${randomUUID()}.txt`);

    const result = await runCliWithEnv(["retro", sessionPath, "--engine", "codex"], {
      RE_PROMPT_CODEX_BIN: fakeCodex,
      FAKE_ANALYZER_ARGS_FILE: argsFile,
      FAKE_ANALYZER_STDIN_FILE: stdinFile,
      FAKE_ANALYZER_REPORT: JSON.stringify(analyzerReport("codex"))
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Analyzer: requested codex, used codex");
    const args = JSON.parse(await readFile(argsFile, "utf8")) as string[];
    expect(args).toEqual(
      expect.arrayContaining([
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
        "--output-last-message",
        "-"
      ])
    );
    const stdin = await readFile(stdinFile, "utf8");
    expect(stdin).toContain("RE_PROMPT_INTERNAL_ANALYSIS");
    expect(stdin).toContain("Redacted EvidenceBundle JSON");
    expect(stdin).not.toContain("encrypted_content");
  });

  it("invokes claude analyzer with non-persistent JSON output flags for retro", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const fakeClaude = await makeFakeAnalyzerBinary("claude");
    const argsFile = join(tmpdir(), `re-prompt-claude-args-${randomUUID()}.json`);
    const stdinFile = join(tmpdir(), `re-prompt-claude-stdin-${randomUUID()}.txt`);

    const result = await runCliWithEnv(["retro", sessionPath, "--engine", "claude"], {
      RE_PROMPT_CLAUDE_BIN: fakeClaude,
      FAKE_ANALYZER_ARGS_FILE: argsFile,
      FAKE_ANALYZER_STDIN_FILE: stdinFile,
      FAKE_ANALYZER_REPORT: JSON.stringify(analyzerReport("claude"))
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Analyzer: requested claude, used claude");
    const args = JSON.parse(await readFile(argsFile, "utf8")) as string[];
    expect(args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--json-schema", "--no-session-persistence", "--tools", ""]));
    const stdin = await readFile(stdinFile, "utf8");
    expect(stdin).toContain("RE_PROMPT_INTERNAL_ANALYSIS");
  });

  it("falls back to heuristic output when an analyzer is missing or malformed", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const missing = await runCliWithEnv(["retro", sessionPath, "--engine", "codex"], {
      RE_PROMPT_CODEX_BIN: join(tmpdir(), `missing-codex-${randomUUID()}`)
    });
    expect(missing.exitCode).toBe(0);
    expect(missing.stdout).toContain("Analyzer: requested codex, used none (fallback)");
    expect(missing.stdout).toContain("Better initial prompt");

    const fakeClaude = await makeFakeAnalyzerBinary("claude");
    const invalid = await runCliWithEnv(["retro", sessionPath, "--engine", "claude"], {
      RE_PROMPT_CLAUDE_BIN: fakeClaude,
      FAKE_ANALYZER_MODE: "invalid"
    });
    expect(invalid.exitCode).toBe(0);
    expect(invalid.stdout).toContain("Analyzer: requested claude, used none (fallback)");

    const schemaMismatch = await runCliWithEnv(["retro", sessionPath, "--engine", "claude"], {
      RE_PROMPT_CLAUDE_BIN: fakeClaude,
      FAKE_ANALYZER_REPORT: JSON.stringify({ schemaVersion: 1 })
    });
    expect(schemaMismatch.exitCode).toBe(0);
    expect(schemaMismatch.stdout).toContain("Analyzer: requested claude, used none (fallback)");

    const fakeCodex = await makeFakeAnalyzerBinary("codex");
    const timeout = await runCliWithEnv(["retro", sessionPath, "--engine", "codex"], {
      RE_PROMPT_CODEX_BIN: fakeCodex,
      FAKE_ANALYZER_MODE: "sleep",
      RE_PROMPT_ANALYZER_TIMEOUT_MS: "50"
    });
    expect(timeout.exitCode).toBe(0);
    expect(timeout.stdout).toContain("Analyzer: requested codex, used none (fallback)");
  });

  it("falls back when an analyzer report fails quality checks", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const fakeCodex = await makeFakeAnalyzerBinary("codex");
    const report = analyzerReport("codex");
    report.betterInitialPrompt.prompt = "Be more specific.";

    const result = await runCliWithEnv(["retro", sessionPath, "--engine", "codex"], {
      RE_PROMPT_CODEX_BIN: fakeCodex,
      FAKE_ANALYZER_REPORT: JSON.stringify(report)
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Analyzer: requested codex, used none (fallback)");
    expect(result.stdout).toContain("failed quality checks");
  });

  it("keeps scan heuristic-only even when a CLI engine is requested", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const result = await runCli(["scan", "--since", "7d", "--engine", "codex", "--codex-home", codexHome]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("scan is heuristic-only");
  });

  it("prints no rules dry-run diff for a single one-off signal without modifying AGENTS.md", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const repo = await mkdtemp(join(tmpdir(), "re-prompt-cli-repo-"));
    const agentsPath = join(repo, "AGENTS.md");
    await writeFile(agentsPath, "# AGENTS.md\n", "utf8");

    const result = await runCli(["rules", "--since", "30d", "--codex-home", codexHome, "--repo", repo]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No AGENTS.md rule changes suggested.");
    expect(await readFile(agentsPath, "utf8")).toBe("# AGENTS.md\n");
  });

  it("reports large sessions in doctor without parsing full transcripts", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-cli-large-doctor-"));
    const day = join(codexHome, "sessions", "2026", "06", "20");
    await mkdir(day, { recursive: true });
    const sessionPath = join(day, "rollout-2026-06-20T03-00-00-large.jsonl");
    await writeFile(
      sessionPath,
      `{"type":"session_meta","payload":{"id":"large-doctor","cwd":"/tmp/large"}}\n${"x".repeat(2048)}`,
      "utf8"
    );

    const result = await runCliWithEnv(["doctor", "--codex-home", codexHome], {
      RE_PROMPT_MAX_TRANSCRIPT_BYTES: "1024"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("largest session");
    expect(result.stdout).toContain("larger than scan limit");
  });

  it("skips oversized sessions in scan and fails explicit retro with a friendly message", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-cli-large-scan-"));
    const day = join(codexHome, "sessions", "2026", "06", "20");
    await mkdir(day, { recursive: true });
    const sessionPath = join(day, "rollout-2026-06-20T04-00-00-large.jsonl");
    await writeFile(
      sessionPath,
      `{"type":"session_meta","payload":{"id":"large-scan","cwd":"/tmp/large"}}\n${"x".repeat(2048)}`,
      "utf8"
    );

    const scan = await runCliWithEnv(["scan", "--since", "7d", "--engine", "none", "--codex-home", codexHome], {
      RE_PROMPT_MAX_TRANSCRIPT_BYTES: "1024"
    });
    expect(scan.exitCode).toBe(0);
    expect(scan.stdout).toContain("too_large");

    const retro = await runCliWithEnv(["retro", sessionPath, "--engine", "none"], {
      RE_PROMPT_MAX_TRANSCRIPT_BYTES: "1024"
    });
    expect(retro.exitCode).toBe(1);
    expect(retro.stderr).toContain("too large for this release");
  });

  it("last explains selected session and skipped newer oversized sessions", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-cli-last-selection-"));
    const day = join(codexHome, "sessions", "2026", "06", "20");
    await mkdir(day, { recursive: true });
    const selectedPath = join(day, "rollout-2026-06-20T05-00-00-selected.jsonl");
    const oversizedPath = join(day, "rollout-2026-06-20T06-00-00-oversized.jsonl");
    await copyFile(fixturePath("late-constraint.jsonl"), selectedPath);
    await writeFile(
      oversizedPath,
      `{"type":"session_meta","payload":{"id":"oversized-newer","cwd":"/tmp/api"}}\n${"x".repeat(8192)}`,
      "utf8"
    );
    await utimes(selectedPath, new Date("2026-06-20T05:00:00.000Z"), new Date("2026-06-20T05:00:00.000Z"));
    await utimes(oversizedPath, new Date("2026-06-20T06:00:00.000Z"), new Date("2026-06-20T06:00:00.000Z"));

    const result = await runCliWithEnv(["last", "--codex-home", codexHome], {
      RE_PROMPT_MAX_TRANSCRIPT_BYTES: "4096"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Selected session");
    expect(result.stdout).toContain("Selected because: most recent analyzable session");
    expect(result.stdout).toContain("Skipped newer sessions: 1 too_large");
    expect(result.stdout).toContain("sess-late");
  });
});

function analyzerReport(engine: "codex" | "claude"): RetroReport {
  return {
    schemaVersion: 1,
    session: {
      source: "codex",
      sessionId: "sess-late",
      title: `${engine} grounded retro`,
      inferredGoal: "Refactor the auth middleware while preserving the public API response shape.",
      outcome: "unclear",
      confidence: "medium"
    },
    executiveSummary: "Turn 2 added the public API response shape constraint after `src/auth/middleware.ts` was already touched.",
    friction: {
      score: 70,
      label: "high",
      mainCause: "late_constraint"
    },
    turningPoints: [
      {
        turnIndex: 2,
        title: "Constraint arrived after work had started",
        whatHappened: "Turn 2 introduced the public API response shape constraint.",
        whyItMattered: "The constraint should have been in the initial prompt before editing `src/auth/middleware.ts`.",
        evidence: [{ turnIndex: 2, eventKind: "user_message", quote: "Keep the public API response shape unchanged." }]
      }
    ],
    findings: [
      {
        id: "F1",
        title: "Constraint arrived after work had started",
        severity: "high",
        confidence: "high",
        diagnosis: "Turn 2 introduced the public API response shape constraint after edits began.",
        evidence: [{ turnIndex: 2, eventKind: "user_message", quote: "Keep the public API response shape unchanged." }],
        betterBehavior: "Move the public API response shape constraint into the first prompt before editing `src/auth/middleware.ts`.",
        suggestedFix: {
          kind: "initial_prompt",
          text: "Include the public API response shape constraint and `src/auth/middleware.ts` in the initial prompt."
        }
      }
    ],
    betterInitialPrompt: {
      prompt: "Refactor `src/auth/middleware.ts`, but keep the public API response shape unchanged.",
      whyThisWouldHelp: "It moves the Turn 2 constraint into the first prompt.",
      confidence: "high"
    },
    rescuePrompts: [
      {
        turnIndex: 2,
        prompt: "At Turn 2, stop editing. Preserve this constraint exactly: keep the public API response shape unchanged.",
        useWhen: "Use at Turn 2 when a compatibility constraint arrives after edits begin.",
        expectedEffect: "Prevents more edits before the compatibility plan is clear.",
        confidence: "high"
      }
    ],
    agentsMdPatch: {
      shouldPatch: false,
      target: "none",
      rationale: "This is a one-off compatibility constraint, not a durable repo rule.",
      patchMarkdown: "",
      rules: []
    },
    nextSessionChecklist: ["Put the public API response shape constraint in the first prompt."],
    limitations: ["External CLI analysis used only the redacted EvidenceBundle."]
  };
}
