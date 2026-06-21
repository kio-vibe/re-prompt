import { copyFile, mkdir, mkdtemp, readFile, symlink, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";
import { fixturePath } from "../helpers.js";

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
    expect(result.stdout).toBe("0.1.1");
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

    const result = await runCliWithEnv(["last", "--engine", "none", "--codex-home", codexHome], {
      RE_PROMPT_MAX_TRANSCRIPT_BYTES: "4096"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Selected session");
    expect(result.stdout).toContain("Selected because: most recent analyzable session");
    expect(result.stdout).toContain("Skipped newer sessions: 1 too_large");
    expect(result.stdout).toContain("sess-late");
  });
});
