import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execa } from "execa";

async function runInstaller(codexHome: string, args: string[] = []) {
  return execa("bash", ["scripts/install-personal-skill.sh", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CODEX_HOME: codexHome },
    reject: false
  });
}

const legacySkillNames = [
  "re-prompt-go",
  "re-prompt-install",
  "re-prompt-last",
  "re-prompt-retro",
  "re-prompt-rules"
];

async function writeLegacySkill(codexHome: string, skillName: string): Promise<void> {
  const dir = join(codexHome, "skills", skillName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "SKILL.md"),
    `---
name: ${skillName}
description: legacy re-prompt shim
---

# ${skillName}

Do not ask the user to paste raw rollout JSONL.
This legacy re-prompt shim is safe to remove.
`,
    "utf8"
  );
}

describe("personal skill installer", () => {
  it("prints the single target skill and legacy cleanup plan without writing files in dry-run mode", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-skill-dry-run-"));
    await writeLegacySkill(codexHome, "re-prompt-go");

    const result = await runInstaller(codexHome, ["--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run: no files written.");
    expect(result.stdout).toContain("does not install or update the global re-prompt CLI");
    expect(result.stdout).toContain("re-prompt-0.4.2.tgz");
    expect(result.stdout).toContain(`Target: ${join(codexHome, "skills", "re-prompt", "SKILL.md")}`);
    expect(result.stdout).toContain("Cleanup: remove legacy re-prompt-owned skill");
    expect(result.stdout).toContain("type /re-prompt");
    await expect(stat(join(codexHome, "skills", "re-prompt", "SKILL.md"))).rejects.toThrow();
    await expect(stat(join(codexHome, "skills", "re-prompt-go", "SKILL.md"))).resolves.toBeTruthy();
  });

  it("installs only the base re-prompt skill and removes confirmed legacy shims", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-skill-install-"));
    for (const skillName of legacySkillNames) {
      await writeLegacySkill(codexHome, skillName);
    }

    const result = await runInstaller(codexHome);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Installed re-prompt personal skill.");
    expect(result.stdout).toContain("Removed 5 legacy command-specific skill shim(s).");

    const installed = await readFile(join(codexHome, "skills", "re-prompt", "SKILL.md"), "utf8");
    expect(installed).toContain("name: re-prompt");
    expect(installed).toContain("re-prompt candidates --format json --top 3 --language ko");
    expect(installed).toContain("re-prompt candidates --format json --top 3 --language en");
    expect(installed).toContain("map that number to the matching `sessionId`");
    expect(installed).toContain("Do not ask the user to paste raw rollout JSONL");
    expect(installed).toContain("Minimum supported CLI version for this skill: `0.4.0`");
    expect(installed).toContain("Do not directly read, grep, cat, parse, or inspect `~/.codex/sessions/**/*.jsonl`");
    expect(installed).toContain("do not fallback to `scan`, `go`, or manual transcript reading");

    for (const skillName of legacySkillNames) {
      await expect(stat(join(codexHome, "skills", skillName, "SKILL.md"))).rejects.toThrow();
    }
  });
});
