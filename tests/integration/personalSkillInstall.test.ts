import { mkdtemp, readFile, stat } from "node:fs/promises";
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

const personalSkillNames = [
  "re-prompt",
  "re-prompt-go",
  "re-prompt-install",
  "re-prompt-last",
  "re-prompt-retro",
  "re-prompt-rules"
];

describe("personal skill installer", () => {
  it("prints all target personal skill paths without writing files in dry-run mode", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-skill-dry-run-"));

    const result = await runInstaller(codexHome, ["--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run: no files written.");
    expect(result.stdout).toContain("/re-prompt-go");
    for (const skillName of personalSkillNames) {
      const target = join(codexHome, "skills", skillName, "SKILL.md");
      expect(result.stdout).toContain(`Target: ${target}`);
      await expect(stat(target)).rejects.toThrow();
    }
  });

  it("installs command-specific re-prompt skill shims into CODEX_HOME personal skills", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-skill-install-"));

    const result = await runInstaller(codexHome);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Installed 6 personal skill shims.");
    for (const skillName of personalSkillNames) {
      const target = join(codexHome, "skills", skillName, "SKILL.md");
      const installed = await readFile(target, "utf8");
      expect(installed).toContain(`name: ${skillName}`);
      expect(installed).toContain("description:");
      expect(installed).toContain("Do not ask the user to paste raw rollout JSONL");
    }

    const goSkill = await readFile(
      join(codexHome, "skills", "re-prompt-go", "SKILL.md"),
      "utf8"
    );
    expect(goSkill).toContain("re-prompt go --next-style plugin --language auto");
    expect(goSkill).toContain("Friction");
    expect(goSkill).toContain("꼬였을 가능성");
  });
});
