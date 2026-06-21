import { buildEvidenceBundle } from "../../src/core/evidence/buildEvidenceBundle.js";
import { extractSignals } from "../../src/core/signals/index.js";
import { computeFrictionScore } from "../../src/core/scoring/frictionScore.js";
import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { normalizeCodexSession } from "../../src/sources/codex/normalizeCodexSession.js";
import { fixturePath, readFixture } from "../helpers.js";

async function loadSession(name: string) {
  const parsed = parseCodexJsonl(await readFixture(name));
  return normalizeCodexSession(parsed, { transcriptPath: fixturePath(name) });
}

describe("signal extraction", () => {
  it("detects user correction and late constraints after edits", async () => {
    const session = await loadSession("late-constraint.jsonl");
    const signals = extractSignals(session);

    expect(signals.map((signal) => signal.kind)).toEqual(
      expect.arrayContaining(["user_correction", "late_constraint", "premature_edit"])
    );
    expect(signals.find((signal) => signal.kind === "late_constraint")?.evidence.length).toBeGreaterThan(0);
  });

  it("detects repeated failures from matching command output fingerprints", async () => {
    const session = await loadSession("repeated-test-failure.jsonl");
    const signals = extractSignals(session);

    expect(signals.some((signal) => signal.kind === "repeated_failure")).toBe(true);
    expect(computeFrictionScore(session, signals)).toBeGreaterThan(40);
  });

  it("detects verification gaps and scope drift", async () => {
    const unverifiedSignals = extractSignals(await loadSession("unverified-done.jsonl"));
    const driftSignals = extractSignals(await loadSession("scope-drift.jsonl"));

    expect(unverifiedSignals.some((signal) => signal.kind === "verification_gap")).toBe(true);
    expect(driftSignals.some((signal) => signal.kind === "scope_drift")).toBe(true);
  });

  it("does not treat follow-up implementation plans as late constraints", async () => {
    const signals = extractSignals(await loadSession("plan-followups-not-late-constraint.jsonl"));

    expect(signals.some((signal) => signal.kind === "late_constraint")).toBe(false);
    expect(signals.some((signal) => signal.kind === "user_correction")).toBe(false);
  });

  it("does not treat Korean comparison questions as corrections", async () => {
    const signals = extractSignals(await loadSession("korean-status-question-not-correction.jsonl"));

    expect(signals.some((signal) => signal.kind === "user_correction")).toBe(false);
  });

  it("does not treat inspection commands with test paths as verification", async () => {
    const session = await loadSession("sed-test-path-not-verification.jsonl");
    const signals = extractSignals(session);
    const bundle = buildEvidenceBundle(session, signals);

    expect(bundle.concreteFacts.observedTestCommands).toEqual([]);
    expect(signals.some((signal) => signal.kind === "verification_gap")).toBe(true);
  });

  it("builds compact evidence without full raw transcript content", async () => {
    const session = await loadSession("late-constraint.jsonl");
    const signals = extractSignals(session);
    const bundle = buildEvidenceBundle(session, signals);

    expect(bundle.initialUserPrompt).toBe("Refactor the auth middleware.");
    expect(bundle.timeline.length).toBe(2);
    expect(bundle.changedFiles[0]).toMatchObject({
      path: "src/auth/middleware.ts",
      changeCount: 1
    });
    expect(JSON.stringify(bundle)).not.toContain("encrypted_content");
  });
});
