import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createTwoFilesPatch } from "diff";
import type { EvidenceBundle } from "../core/types.js";

export interface GenerateAgentsMdPatchOptions {
  repoRoot: string;
  bundles: EvidenceBundle[];
  maxRules?: number;
}

export interface AgentsMdPatchResult {
  targetPath: string;
  applied: false;
  rules: string[];
  diff: string;
}

export async function generateAgentsMdPatch(
  options: GenerateAgentsMdPatchOptions
): Promise<AgentsMdPatchResult> {
  const targetPath = join(options.repoRoot, "AGENTS.md");
  const existing = await readFile(targetPath, "utf8").catch(() => "");
  const existingLower = existing.toLowerCase();
  const rules = collectRules(options.bundles)
    .filter((rule) => !existingLower.includes(rule.toLowerCase()))
    .slice(0, options.maxRules ?? 5);
  const next = appendRules(existing, rules);
  return {
    targetPath,
    applied: false,
    rules,
    diff: createTwoFilesPatch("AGENTS.md", "AGENTS.md", existing, next, "current", "proposed")
  };
}

function collectRules(bundles: EvidenceBundle[]): string[] {
  const candidates: string[] = [];
  for (const bundle of bundles) {
    for (const signal of bundle.signals) {
      if (signal.kind === "late_constraint" || signal.kind === "user_correction") {
        candidates.push(
          "Before refactors, state compatibility assumptions and preserve public API behavior unless explicitly requested."
        );
      }
      if (signal.kind === "verification_gap") {
        candidates.push("Do not claim completion after file edits until the relevant verification command has run.");
      }
      if (signal.kind === "scope_drift") {
        candidates.push("For small bug fixes, keep changes scoped and ask before adding dependencies or broad architectural edits.");
      }
      if (signal.kind === "environment_gap") {
        candidates.push("Document package manager and verification commands so Codex does not probe the environment repeatedly.");
      }
    }
  }
  return [...new Set(candidates)].filter((rule) => !/be more specific|provide more context/i.test(rule));
}

function appendRules(existing: string, rules: string[]): string {
  if (rules.length === 0) {
    return existing;
  }
  const base = existing.trimEnd();
  const section = ["", "## Lessons from recent Codex sessions", "", ...rules.map((rule) => `- ${rule}`)].join("\n");
  return `${base}${section}\n`;
}
