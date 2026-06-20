import type { Analyzer, AnalyzerOptions } from "./Analyzer.js";
import type { EvidenceBundle, Finding, RetroReport, RescuePrompt, SessionSignal } from "../core/types.js";
import { computeFrictionScore, frictionLabel } from "../core/scoring/frictionScore.js";

export class HeuristicOnlyAnalyzer implements Analyzer {
  public async analyze(bundle: EvidenceBundle, _options: AnalyzerOptions): Promise<RetroReport> {
    const score = computeScoreFromBundle(bundle);
    const mainSignal = bundle.signals[0];
    const findings = bundle.signals.map((signal, index) => signalToFinding(signal, index + 1));
    const rescuePrompts = bundle.signals
      .filter((signal) => signal.suggestedActionKind === "rescue_prompt")
      .map(signalToRescuePrompt);
    const rules = buildRules(bundle);

    return {
      schemaVersion: 1,
      session: {
        source: "codex",
        sessionId: bundle.session.sessionId,
        title: inferTitle(bundle),
        inferredGoal: bundle.initialUserPrompt ?? "Unknown Codex task",
        outcome: inferOutcome(bundle),
        confidence: bundle.initialUserPrompt ? "medium" : "low"
      },
      executiveSummary: mainSignal
        ? `${mainSignal.title}: ${mainSignal.summary}`
        : "No high-friction signal was detected in this session.",
      friction: {
        score,
        label: frictionLabel(score),
        mainCause: mapMainCause(mainSignal?.kind)
      },
      turningPoints: bundle.signals.map((signal) => ({
        turnIndex: signal.turnIndex,
        title: signal.title,
        whatHappened: signal.summary,
        whyItMattered: whySignalMatters(signal),
        evidence: signal.evidence
      })),
      findings,
      betterInitialPrompt: {
        prompt: buildBetterInitialPrompt(bundle),
        whyThisWouldHelp: mainSignal
          ? `This moves the lesson from ${mainSignal.title.toLowerCase()} into the first prompt.`
          : "This asks Codex to inspect, plan, and verify before declaring completion.",
        confidence: mainSignal ? mainSignal.confidence : "medium"
      },
      rescuePrompts,
      agentsMdPatch: {
        shouldPatch: rules.length > 0,
        target: rules.length > 0 ? "repo" : "none",
        rationale:
          rules.length > 0
            ? "At least one lesson looks durable enough to consider for repo guidance."
            : "No durable repo rule was detected.",
        patchMarkdown: rules.map((rule) => `- ${rule}`).join("\n"),
        rules
      },
      nextSessionChecklist: [
        "State non-negotiable constraints in the first prompt.",
        "Ask Codex to inspect relevant files and tests before broad edits.",
        "Require a short plan before refactors or multi-file changes.",
        "Run the relevant verification command before accepting completion."
      ],
      limitations: [
        "0.1.0 uses deterministic local heuristics only.",
        "Transcript parsing is best-effort and may miss new Codex event shapes."
      ]
    };
  }
}

function computeScoreFromBundle(bundle: EvidenceBundle): number {
  const base = Math.min(bundle.session.turnCount * 1.5, 25);
  const failedCommandScore = bundle.session.failedCommandCount * 5;
  const signalScore = bundle.signals.reduce((sum, signal) => {
    const weight =
      signal.kind === "repeated_failure"
        ? 14
        : signal.kind === "late_constraint"
          ? 12
          : signal.kind === "user_correction" || signal.kind === "scope_drift"
            ? 10
            : signal.kind === "verification_gap" || signal.kind === "file_churn"
              ? 8
              : 6;
    return sum + weight;
  }, 0);
  return Math.min(100, Math.round(base + failedCommandScore + signalScore));
}

function signalToFinding(signal: SessionSignal, index: number): Finding {
  return {
    id: `F${index}`,
    title: signal.title,
    severity: signal.severity,
    confidence: signal.confidence,
    diagnosis: signal.summary,
    evidence: signal.evidence,
    betterBehavior: whySignalMatters(signal),
    suggestedFix:
      signal.suggestedActionKind === "rescue_prompt"
        ? { kind: "rescue_prompt", turnIndex: signal.turnIndex, text: buildRescuePrompt(signal) }
        : signal.suggestedActionKind === "agents_md_rule"
          ? { kind: "agents_md_rule", text: ruleForSignal(signal) }
          : signal.suggestedActionKind === "workflow_change"
            ? { kind: "workflow", text: "Require inspection, planning, and verification before accepting completion." }
            : { kind: "initial_prompt", text: "Move this constraint into the initial task prompt." }
  };
}

function signalToRescuePrompt(signal: SessionSignal): RescuePrompt {
  return {
    turnIndex: signal.turnIndex,
    prompt: buildRescuePrompt(signal),
    useWhen: `Use when you notice ${signal.title.toLowerCase()}.`,
    expectedEffect: "Stops the current trajectory and forces a compatibility-preserving plan before more edits.",
    confidence: signal.confidence
  };
}

function buildRescuePrompt(signal: SessionSignal): string {
  if (signal.kind === "user_correction" || signal.kind === "late_constraint") {
    return "Stop. Preserve the constraint I just stated. List the files changed so far that may violate it, then propose a compatibility-preserving plan before editing again.";
  }
  if (signal.kind === "repeated_failure") {
    return "Stop and diagnose the repeated failure. Summarize the exact failing assertion, list the hypotheses you have ruled out, and propose one next change before editing.";
  }
  return "Stop. Re-state the goal, list what changed, identify missing verification, and propose the smallest safe next step before editing.";
}

function buildBetterInitialPrompt(bundle: EvidenceBundle): string {
  const initial = bundle.initialUserPrompt ?? "Complete the requested Codex task.";
  const constraints = bundle.constraints.filter((constraint) => constraint.late).map((constraint) => constraint.text);
  const constraintText =
    constraints.length > 0
      ? `\n\nPreserve these constraints from the start:\n${constraints.map((constraint) => `- ${constraint}`).join("\n")}`
      : "";
  return `${initial}${constraintText}\n\nBefore editing files:\n1. Inspect the relevant implementation and tests.\n2. State the assumptions and compatibility constraints you will preserve.\n3. Propose the minimal change plan.\n\nAfter editing, run the relevant verification command and report the result.`;
}

function buildRules(bundle: EvidenceBundle): string[] {
  return [...new Set(bundle.signals.map(ruleForSignal).filter(Boolean))].slice(0, 5);
}

function ruleForSignal(signal: SessionSignal): string {
  if (signal.kind === "late_constraint" || signal.kind === "user_correction") {
    return "Before refactors, state compatibility assumptions and preserve public API behavior unless explicitly requested.";
  }
  if (signal.kind === "verification_gap") {
    return "Do not claim completion after file edits until the relevant verification command has run.";
  }
  if (signal.kind === "environment_gap") {
    return "Document the package manager and verification commands so Codex does not probe the environment repeatedly.";
  }
  if (signal.kind === "scope_drift") {
    return "For small bug fixes, keep changes scoped and ask before adding dependencies or broad architectural edits.";
  }
  return "";
}

function inferTitle(bundle: EvidenceBundle): string {
  return bundle.initialUserPrompt?.slice(0, 80) || `Codex session ${bundle.session.sessionId}`;
}

function inferOutcome(bundle: EvidenceBundle): RetroReport["session"]["outcome"] {
  if (bundle.failedCommands.length > 0) {
    return "partially_successful";
  }
  if (bundle.signals.some((signal) => signal.kind === "verification_gap" || signal.kind === "user_correction")) {
    return "unclear";
  }
  return "successful";
}

function mapMainCause(kind: SessionSignal["kind"] | undefined): RetroReport["friction"]["mainCause"] {
  if (kind === "late_constraint" || kind === "user_correction") {
    return "late_constraint";
  }
  if (kind === "repeated_failure") {
    return "agent_loop";
  }
  if (kind === "verification_gap") {
    return "verification_gap";
  }
  if (kind === "scope_drift") {
    return "scope_drift";
  }
  if (kind === "environment_gap") {
    return "environment_gap";
  }
  return "other";
}

function whySignalMatters(signal: SessionSignal): string {
  if (signal.kind === "late_constraint") {
    return "A constraint that arrives after edits makes the session spend turns undoing or redirecting work.";
  }
  if (signal.kind === "repeated_failure") {
    return "Repeated identical failures usually mean the agent needs to stop changing code and diagnose the invariant it is missing.";
  }
  if (signal.kind === "verification_gap") {
    return "The user cannot trust completion without a fresh verification command tied to the changed behavior.";
  }
  return "Moving this lesson earlier reduces wasted turns and makes the next session easier to steer.";
}
