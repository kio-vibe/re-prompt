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
  if (rules.length === 0) {
    return {
      targetPath,
      applied: false,
      rules,
      diff: ""
    };
  }
  const next = appendRules(existing, rules);
  return {
    targetPath,
    applied: false,
    rules,
    diff: createTwoFilesPatch("AGENTS.md", "AGENTS.md", existing, next, "current", "proposed")
  };
}

function collectRules(bundles: EvidenceBundle[]): string[] {
  const candidates = new Map<string, Set<string>>();
  for (const bundle of bundles) {
    for (const rule of rulesForBundle(bundle)) {
      const sessions = candidates.get(rule) ?? new Set<string>();
      sessions.add(bundle.session.sessionId);
      candidates.set(rule, sessions);
    }
  }
  return [...candidates.entries()]
    .filter(([rule, sessions]) => sessions.size >= 2 && !/be more specific|provide more context/i.test(rule))
    .map(([rule]) => rule);
}

function rulesForBundle(bundle: EvidenceBundle): string[] {
  const rules: string[] = [];
  for (const signal of bundle.signals) {
    if (signal.kind === "late_constraint" || signal.kind === "user_correction") {
      const durableConstraint = bundle.concreteFacts.lateConstraints.some((constraint) =>
        /\b(api|schema|database|migration|security|bounded|transcript|rollout|AGENTS\.md)\b/i.test(constraint)
      );
      if (durableConstraint) {
        rules.push("Before refactors, state compatibility assumptions and preserve durable API, schema, and data-processing invariants.");
      }
    }
    if (signal.kind === "verification_gap" && bundle.concreteFacts.observedTestCommands.length > 0) {
      const command = bundle.concreteFacts.observedTestCommands[0]!;
      rules.push(`Do not claim completion after file edits until ${command} has run or the reason it could not run is stated.`);
    }
    if (signal.kind === "scope_drift") {
      rules.push("For small bug fixes, keep changes scoped and ask before adding dependencies or broad architectural edits.");
    }
    if (signal.kind === "environment_gap" && bundle.concreteFacts.packageManagers.length > 0) {
      const manager = bundle.concreteFacts.packageManagers[0]!;
      rules.push(`Use ${manager} for this repository's setup and verification commands unless the user specifies otherwise.`);
    }
  }
  return rules;
}

function appendRules(existing: string, rules: string[]): string {
  if (rules.length === 0) {
    return existing;
  }
  const base = existing.trimEnd();
  const section = ["", "## Lessons from recent Codex sessions", "", ...rules.map((rule) => `- ${rule}`)].join("\n");
  return `${base}${section}\n`;
}
