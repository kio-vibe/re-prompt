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

describe("personal skill installer", () => {
  it("prints the target personal skill path without writing files in dry-run mode", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-skill-dry-run-"));
    const target = join(codexHome, "skills", "re-prompt", "SKILL.md");

    const result = await runInstaller(codexHome, ["--dry-run"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Dry run: no files written.");
    expect(result.stdout).toContain(`Target: ${target}`);
    await expect(stat(target)).rejects.toThrow();
  });

  it("installs the re-prompt skill shim into CODEX_HOME personal skills", async () => {
    const codexHome = await mkdtemp(join(tmpdir(), "re-prompt-skill-install-"));
    const target = join(codexHome, "skills", "re-prompt", "SKILL.md");

    const result = await runInstaller(codexHome);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Installed personal skill shim.");
    const installed = await readFile(target, "utf8");
    expect(installed).toContain("name: re-prompt");
    expect(installed).toContain("description:");
    expect(installed).toContain("Do not ask the user to paste raw rollout JSONL");
  });
});
