import { chmod, copyFile, mkdir, mkdtemp, readFile, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execa } from "execa";
import { fixturePath } from "../helpers.js";
import type { PromptCoachReport, PromptHabitReport, RetroReport } from "../../src/core/types.js";

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
    expect(result.stdout).toBe("0.5.0");
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

  it("prints prompt habits from the default no-args entry point", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCliWithEnv([], {
      CODEX_HOME: codexHome,
      LANG: "ko_KR.UTF-8",
      RE_PROMPT_CODEX_BIN: join(tmpdir(), `missing-codex-${randomUUID()}`)
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("최근 세션에서 보이는 프롬프트 습관");
    expect(result.stdout).toContain("다음엔 이렇게 시작하면 좋아요");
    expect(result.stdout).toContain("근거가 된 세션");
    expect(result.stdout).toContain("자세히 볼 번호만 말해줘");
    expect(result.stdout).not.toContain("Friction");
    expect(result.stdout).not.toContain("heuristic-only");
  });

  it("prints stable habit JSON from local fallback", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["habits", "--codex-home", codexHome, "--engine", "none", "--language", "ko", "--format", "json"]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout) as PromptHabitReport;
    expect(json.schemaVersion).toBe(1);
    expect(json.analysis).toMatchObject({ requestedEngine: "none", usedEngine: "none", fallback: false });
    expect(json.evidenceSessions[0]).toMatchObject({ index: 1, sessionId: "sess-late" });
    expect(json.defaultRewrite).toContain("다만 처음부터 기준을 이렇게 잡고 가자");
    expect(result.stdout).not.toContain("I changed the middleware");
    expect(result.stdout).not.toContain("return json");
  });

  it("invokes codex analyzer with a redacted prompt habit bundle", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const fakeCodex = await makeFakeAnalyzerBinary("codex");
    const argsFile = join(tmpdir(), `re-prompt-habit-codex-args-${randomUUID()}.json`);
    const stdinFile = join(tmpdir(), `re-prompt-habit-codex-stdin-${randomUUID()}.txt`);

    const result = await runCliWithEnv(["habits", "--codex-home", codexHome, "--engine", "codex", "--language", "ko"], {
      RE_PROMPT_CODEX_BIN: fakeCodex,
      FAKE_ANALYZER_ARGS_FILE: argsFile,
      FAKE_ANALYZER_STDIN_FILE: stdinFile,
      FAKE_ANALYZER_REPORT: JSON.stringify(habitReport("codex"))
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# 최근 세션에서 보이는 프롬프트 습관");
    expect(result.stdout).toContain("분석: codex");
    const args = JSON.parse(await readFile(argsFile, "utf8")) as string[];
    expect(args).toEqual(expect.arrayContaining(["exec", "--disable", "plugins", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--output-schema"]));
    const stdin = await readFile(stdinFile, "utf8");
    expect(stdin).toContain("RE_PROMPT_INTERNAL_ANALYSIS");
    expect(stdin).toContain("Redacted PromptHabitBundle JSON");
    expect(stdin).toContain("Refactor the auth middleware");
    expect(stdin).not.toContain("Redacted PromptCoachBundle JSON");
    expect(stdin).not.toContain("I changed the middleware");
    expect(stdin).not.toContain("return json");
  });

  it("invokes claude analyzer for habits and falls back on malformed output", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");
    const fakeClaude = await makeFakeAnalyzerBinary("claude");
    const argsFile = join(tmpdir(), `re-prompt-habit-claude-args-${randomUUID()}.json`);
    const stdinFile = join(tmpdir(), `re-prompt-habit-claude-stdin-${randomUUID()}.txt`);

    const result = await runCliWithEnv(["habits", "--codex-home", codexHome, "--engine", "claude", "--language", "ko"], {
      RE_PROMPT_CLAUDE_BIN: fakeClaude,
      FAKE_ANALYZER_ARGS_FILE: argsFile,
      FAKE_ANALYZER_STDIN_FILE: stdinFile,
      FAKE_ANALYZER_REPORT: JSON.stringify(habitReport("claude"))
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("분석: claude");
    const args = JSON.parse(await readFile(argsFile, "utf8")) as string[];
    expect(args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--json-schema", "--no-session-persistence", "--tools", ""]));
    const stdin = await readFile(stdinFile, "utf8");
    expect(stdin).toContain("Redacted PromptHabitBundle JSON");

    const fallback = await runCliWithEnv(["habits", "--codex-home", codexHome, "--engine", "claude", "--language", "ko"], {
      RE_PROMPT_CLAUDE_BIN: fakeClaude,
      FAKE_ANALYZER_MODE: "invalid"
    });
    expect(fallback.exitCode).toBe(0);
    expect(fallback.stdout).toContain("claude 실패 후 낮은 확신의 로컬 fallback");
  });

  it("prints stable candidate JSON without assistant or command output", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["candidates", "--codex-home", codexHome, "--top", "3", "--format", "json", "--language", "en"]);

    expect(result.exitCode).toBe(0);
    const rows = JSON.parse(result.stdout) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      index: 1,
      sessionId: "sess-late",
      turnCount: 2
    });
    expect(rows[0]?.chatSummary).toContain("Refactor the auth middleware.");
    expect(rows[0]?.shortProblem).toContain("condition");
    expect(rows[0]).not.toHaveProperty("path");
    expect(rows[0]).not.toHaveProperty("score");
    expect(result.stdout).not.toContain("I changed the middleware");
    expect(result.stdout).not.toContain("return json");
  });

  it("guides a first run with beginner-friendly English summary and next commands", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--top", "3", "--language", "en"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("re-prompt go");
    expect(result.stdout).toContain("Found 1 local Codex sessions.");
    expect(result.stdout).toContain("A rough first session to inspect");
    expect(result.stdout).toContain("Review priority:");
    expect(result.stdout).toContain("Important constraint arrived mid-session");
    expect(result.stdout).toContain("Next commands:");
    expect(result.stdout).toContain("re-prompt coach sess-late");
    expect(result.stdout).toContain("re-prompt coach");
  });

  it("guides a first run with Korean output when requested", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--top", "3", "--language", "ko"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("최근 Codex 작업 기록 1개를 찾았습니다.");
    expect(result.stdout).toContain("대략 먼저 봐도 좋을 작업");
    expect(result.stdout).toContain("꼬였을 가능성:");
    expect(result.stdout).toContain("중요한 조건이 작업 중간에 나옴");
    expect(result.stdout).toContain("빠른 로컬 규칙으로 후보만 고름");
    expect(result.stdout).toContain("re-prompt coach sess-late");
  });

  it("auto-selects Korean or English go output from locale environment", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const korean = await runCliWithEnv(["go", "--codex-home", codexHome, "--top", "3", "--language", "auto"], {
      LANG: "ko_KR.UTF-8"
    });
    expect(korean.exitCode).toBe(0);
    expect(korean.stdout).toContain("최근 Codex 작업 기록 1개를 찾았습니다.");

    const english = await runCliWithEnv(["go", "--codex-home", codexHome, "--top", "3", "--language", "auto"], {
      RE_PROMPT_LANG: "",
      LC_ALL: "",
      LC_MESSAGES: "",
      LANG: "C"
    });
    expect(english.exitCode).toBe(0);
    expect(english.stdout).toContain("Found 1 local Codex sessions.");
  });

  it("can guide plugin users with slash-command next steps", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--top", "3", "--next-style", "plugin", "--language", "ko"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("다음에 해볼 것:");
    expect(result.stdout).toContain("/re-prompt 입력 후 1번 선택");
    expect(result.stdout).toContain("sess-late");
    expect(result.stdout).not.toContain("/re-prompt-retro");
    expect(result.stdout).not.toContain("/re-prompt-last");
    expect(result.stdout).not.toContain("/re-prompt-rules");
    expect(result.stdout).not.toContain("re-prompt coach sess-late");
  });

  it("rejects unsupported go output languages", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--language", "fr"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported language "fr"');
    expect(result.stderr).toContain("Use auto, en, or ko");
  });

  it("rejects unsupported next command styles", async () => {
    const { codexHome } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["go", "--codex-home", codexHome, "--next-style", "terminal"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unsupported next command style "terminal"');
    expect(result.stderr).toContain("Use cli or plugin");
  });

  it("keeps the plugin surface centered on one re-prompt skill", async () => {
    const skill = await readFile("plugins/re-prompt/skills/re-prompt/SKILL.md", "utf8");

    expect(skill).toContain("Respond in the user's language");
    expect(skill).toContain("Before running habit or coach commands, choose one fixed response language");
    expect(skill).toContain("Do not use visible process narration");
    expect(skill).toContain("Do not paste raw CLI output verbatim");
    expect(skill).toContain("in the user's own voice");
    expect(skill).toContain("Do not ask the user to paste raw rollout JSONL");
    expect(skill).toContain("re-prompt habits --format json --language ko --engine codex");
    expect(skill).toContain("re-prompt habits --format json --language en --engine codex");
    expect(skill).toContain("Do not use `--language auto` in the plugin flow");
    expect(skill).toContain("ask the user to choose only a session number");
    expect(skill).toContain("map that number to the matching `sessionId`");
    expect(skill).toContain("re-prompt coach <session-id> --engine codex --language ko");
    expect(skill).toContain("re-prompt coach <session-id> --engine codex --language en");
    expect(skill).toContain("After coaching one evidence session, suggest another evidence session");
    expect(skill).toContain("Do not show internal fields such as scores");
    expect(skill).toContain("Minimum supported CLI version for this skill: `0.5.0`");
    expect(skill).toContain("v0.5.0/re-prompt-0.5.0.tgz");
    expect(skill).toContain("Do not directly read, grep, cat, parse, or inspect `~/.codex/sessions/**/*.jsonl`");
    expect(skill).toContain("Do not use ad hoc Node/Python scripts");
    expect(skill).toContain("If `re-prompt habits` exits non-zero");
    expect(skill).toContain("do not fallback to `candidates`, `scan`, `go`, or manual transcript reading");
  });

  it("go handles an empty Codex home without failing", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-cli-empty-go-"));

    const result = await runCli(["go", "--codex-home", codexHome]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No local Codex session history was found yet.");
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

  it("invokes codex analyzer with a redacted prompt coach bundle", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("plan-followups-not-late-constraint.jsonl");
    const fakeCodex = await makeFakeAnalyzerBinary("codex");
    const argsFile = join(tmpdir(), `re-prompt-coach-codex-args-${randomUUID()}.json`);
    const stdinFile = join(tmpdir(), `re-prompt-coach-codex-stdin-${randomUUID()}.txt`);

    const result = await runCliWithEnv(["coach", sessionPath, "--engine", "codex", "--language", "ko"], {
      RE_PROMPT_CODEX_BIN: fakeCodex,
      FAKE_ANALYZER_ARGS_FILE: argsFile,
      FAKE_ANALYZER_STDIN_FILE: stdinFile,
      FAKE_ANALYZER_REPORT: JSON.stringify(coachReport("codex"))
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# re-prompt 코치");
    expect(result.stdout).toContain("분석: requested codex, used codex");
    expect(result.stdout).toContain("다음엔 이렇게 말하면 돼요");
    expect(result.stdout).toContain("조금 더 탄탄하게 쓰면");
    const args = JSON.parse(await readFile(argsFile, "utf8")) as string[];
    expect(args).toEqual(expect.arrayContaining(["exec", "--disable", "plugins", "--ephemeral", "--ignore-user-config", "--ignore-rules", "--output-schema"]));
    const stdin = await readFile(stdinFile, "utf8");
    expect(stdin).toContain("RE_PROMPT_INTERNAL_ANALYSIS");
    expect(stdin).toContain("Redacted PromptCoachBundle JSON");
    expect(stdin).toContain("Bootstrap the CLI project");
    expect(stdin).not.toContain("Redacted EvidenceBundle JSON");
    expect(stdin).not.toContain("I will implement this new plan");
    expect(stdin).not.toContain("encrypted_content");
  });

  it("invokes claude analyzer for coach and falls back on malformed coach output", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("plan-followups-not-late-constraint.jsonl");
    const fakeClaude = await makeFakeAnalyzerBinary("claude");
    const argsFile = join(tmpdir(), `re-prompt-coach-claude-args-${randomUUID()}.json`);
    const stdinFile = join(tmpdir(), `re-prompt-coach-claude-stdin-${randomUUID()}.txt`);

    const result = await runCliWithEnv(["coach", sessionPath, "--engine", "claude", "--language", "ko"], {
      RE_PROMPT_CLAUDE_BIN: fakeClaude,
      FAKE_ANALYZER_ARGS_FILE: argsFile,
      FAKE_ANALYZER_STDIN_FILE: stdinFile,
      FAKE_ANALYZER_REPORT: JSON.stringify(coachReport("claude"))
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("분석: requested claude, used claude");
    const args = JSON.parse(await readFile(argsFile, "utf8")) as string[];
    expect(args).toEqual(expect.arrayContaining(["-p", "--output-format", "json", "--json-schema", "--no-session-persistence", "--tools", ""]));
    const stdin = await readFile(stdinFile, "utf8");
    expect(stdin).toContain("Redacted PromptCoachBundle JSON");

    const fallback = await runCliWithEnv(["coach", sessionPath, "--engine", "claude", "--language", "ko"], {
      RE_PROMPT_CLAUDE_BIN: fakeClaude,
      FAKE_ANALYZER_MODE: "invalid"
    });
    expect(fallback.exitCode).toBe(0);
    expect(fallback.stdout).toContain("분석: requested claude, used none (fallback)");
    expect(fallback.stdout).toContain("로컬 fallback");
  });

  it("coach defaults to the latest analyzable session and supports json format", async () => {
    const { codexHome } = await makeCodexHomeWithSession("simple-success.jsonl");

    const result = await runCli(["coach", "--engine", "none", "--language", "en", "--format", "json", "--codex-home", codexHome]);

    expect(result.exitCode).toBe(0);
    const json = JSON.parse(result.stdout) as PromptCoachReport;
    expect(json.schemaVersion).toBe(1);
    expect(json.analysis).toMatchObject({ requestedEngine: "none", usedEngine: "none", fallback: false });
    expect(json.rewriteInYourVoice).toContain("Update README title only");
  });

  it("renders Korean coach output with the short rewrite first and without internal jargon", async () => {
    const { sessionPath } = await makeCodexHomeWithSession("late-constraint.jsonl");

    const result = await runCli(["coach", sessionPath, "--engine", "none", "--language", "ko"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.startsWith("# re-prompt 코치")).toBe(true);
    expect(result.stdout).toContain("## 다음엔 이렇게 말하면 돼요");
    expect(result.stdout).toContain("## 조금 더 탄탄하게 쓰면");
    expect(result.stdout).toContain("중요한 조건이 뒤늦게 나온 흔적");
    expect(result.stdout.indexOf("## 다음엔 이렇게 말하면 돼요")).toBeLessThan(result.stdout.indexOf("## 조금 더 탄탄하게 쓰면"));
    expect(result.stdout).not.toContain("Constraint arrived after work had started");
    expect(result.stdout).not.toContain("Friction");
    expect(result.stdout).not.toContain("file_churn");
    expect(result.stdout).not.toContain("heuristic-only");
    expect(result.stdout).not.toContain("Main cause");
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

function coachReport(engine: "codex" | "claude"): PromptCoachReport {
  return {
    schemaVersion: 1,
    analysis: {
      requestedEngine: engine,
      usedEngine: engine,
      fallback: false
    },
    session: {
      source: "codex",
      sessionId: "sess-plan-followups",
      title: `${engine} prompt coach`,
      confidence: "medium"
    },
    language: "ko",
    oneLineTake: "Bootstrap 요청은 짧았고, 뒤에 Release gate 계획이 붙으면서 한 세션 안에서 범위가 커졌습니다.",
    whatYouActuallyWrote: "처음에는 Bootstrap the CLI project라고 했고, 뒤에는 Release gate 계획을 붙였습니다.",
    whereItWentWrong: "Bootstrap이라는 말만으로는 어디까지 만들고 어디서 멈출지 충분히 고정되지 않았습니다.",
    shortRewriteInYourVoice: "Bootstrap만 해줘. Release gate나 tag 작업은 빼고, 끝나기 전에 테스트만 확인해줘.",
    rewriteInYourVoice:
      "Bootstrap the CLI project. 다만 이번 세션에서는 CLI 골격만 만들고, Release gate나 tag 작업은 하지 마. 완료 전에는 pnpm test, pnpm typecheck, pnpm build를 실행해줘.",
    whyThisWorks: "원래 짧은 문장 구조를 유지하면서 범위와 검증 기준을 앞에 붙였기 때문입니다.",
    rescueLine: "여기서 멈추고 Bootstrap 범위인지 Release gate 범위인지 먼저 분리해줘.",
    confidence: "medium",
    limitations: ["External CLI analysis used only the redacted PromptCoachBundle."]
  };
}

function habitReport(engine: "codex" | "claude"): PromptHabitReport {
  return {
    schemaVersion: 1,
    analysis: {
      requestedEngine: engine,
      usedEngine: engine,
      fallback: false
    },
    language: "ko",
    oneLineTake: "최근 요청은 빠르게 방향을 잡지만, 중요한 제약을 뒤에 붙일 때 왕복이 커집니다.",
    strengths: [
      {
        title: "작업 목표를 짧게 시작함",
        detail: "Refactor처럼 원하는 작업을 먼저 말해서 출발점은 분명합니다.",
        evidenceSessionIds: ["sess-late"]
      }
    ],
    risks: [
      {
        title: "중요한 조건이 뒤에 붙음",
        detail: "public API response shape 같은 유지 조건이 처음부터 들어가면 왕복을 줄일 수 있습니다.",
        evidenceSessionIds: ["sess-late"]
      }
    ],
    repeatedPhrases: ["Refactor", "Keep"],
    defaultRewrite:
      "Refactor the auth middleware. 다만 public API response shape는 유지하고, 수정 전 관련 파일을 먼저 확인해줘. 끝나기 전에 관련 테스트도 실행해줘.",
    evidenceSessions: [
      {
        index: 1,
        sessionId: "sess-late",
        title: "Refactor the auth middleware.",
        whyRelevant: "중요한 조건이 뒤에 붙은 근거 세션입니다."
      }
    ],
    confidence: "medium",
    limitations: ["External CLI analysis used only the redacted PromptHabitBundle."]
  };
}
