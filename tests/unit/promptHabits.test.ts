import { parsePromptHabitReport } from "../../src/analyzers/habitSchema.js";
import { buildFallbackPromptHabitReport, lintPromptHabitReport } from "../../src/analyzers/promptHabitAnalyzer.js";
import { buildEvidenceBundle } from "../../src/core/evidence/buildEvidenceBundle.js";
import { buildPromptHabitBundle, type PromptHabitSessionInput } from "../../src/core/habits/buildPromptHabitBundle.js";
import { redactValue } from "../../src/core/privacy/redact.js";
import { extractSignals } from "../../src/core/signals/index.js";
import type { PromptHabitReport } from "../../src/core/types.js";
import { renderPromptHabitReport } from "../../src/renderers/promptHabitRenderer.js";
import { normalizeCodexSession } from "../../src/sources/codex/normalizeCodexSession.js";
import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { readFixture } from "../helpers.js";

describe("prompt habits", () => {
  it("builds a user-message habit bundle without assistant or command output", async () => {
    const bundle = await habitBundleFromFixtures(["simple-success.jsonl"]);
    const serialized = JSON.stringify(bundle);

    expect(bundle.userMessages).toEqual([
      expect.objectContaining({
        sessionId: "sess-simple",
        turnIndex: 1,
        kind: "initial",
        text: "Update README title only."
      })
    ]);
    expect(serialized).not.toContain("I will inspect the README");
    expect(serialized).not.toContain("PASS tests/readme.test.ts");
    expect(serialized).not.toContain("Old title");
  });

  it("redacts local paths and secrets before habit analysis", async () => {
    const bundle = await habitBundleFromFixtures(["attachment-path-request.jsonl"]);
    bundle.userMessages.push({
      sessionId: "sess-attachment",
      turnIndex: 2,
      kind: "follow_up",
      text: "/Users/alice/project OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456 Bearer abcdefghijklmnopqrstuvwxyz123456",
      whyIncluded: "Synthetic privacy check."
    });

    const redacted = redactValue(bundle).value;
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain("/Users/alice");
    expect(serialized).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).toContain("[REDACTED_ENV_SECRET]");
    expect(serialized).toContain("Bearer [REDACTED_TOKEN]");
  });

  it("validates habit reports and rejects overgeneralized or ungrounded output", async () => {
    const bundle = await habitBundleFromFixtures(["late-constraint.jsonl", "plan-followups-not-late-constraint.jsonl"]);
    const report = parsePromptHabitReport(validHabitReport());

    expect(report.schemaVersion).toBe(1);
    expect(lintPromptHabitReport(report, bundle)).toEqual([]);

    const overgeneralized: PromptHabitReport = {
      ...report,
      risks: [
        {
          title: "항상 늦게 말함",
          detail: "항상 중요한 기준이 뒤에 나옵니다.",
          evidenceSessionIds: ["sess-late"]
        }
      ]
    };
    expect(lintPromptHabitReport(overgeneralized, bundle)).toContain("overgeneralized_habit");

    const ungrounded: PromptHabitReport = {
      ...report,
      strengths: [
        {
          title: "Groundless",
          detail: "This cites a session that does not exist.",
          evidenceSessionIds: ["missing-session"]
        }
      ]
    };
    expect(lintPromptHabitReport(ungrounded, bundle)).toContain("missing_evidence_session");
  });

  it("builds and renders a low-confidence fallback habit report", async () => {
    const bundle = await habitBundleFromFixtures(["late-constraint.jsonl", "plan-followups-not-late-constraint.jsonl"]);
    const report = buildFallbackPromptHabitReport(bundle, {
      engine: "codex",
      language: "ko",
      fallback: true,
      fallbackReason: "codex CLI missing"
    });

    expect(report.confidence).toBe("low");
    expect(report.analysis).toMatchObject({ requestedEngine: "codex", usedEngine: "none", fallback: true });
    expect(report.defaultRewrite).toContain("다만 처음부터 기준을 이렇게 잡고 가자");

    const rendered = renderPromptHabitReport(report);
    expect(rendered).toContain("# 최근 세션에서 보이는 프롬프트 습관");
    expect(rendered).toContain("## 다음엔 이렇게 시작하면 좋아요");
    expect(rendered).toContain("## 근거가 된 세션");
    expect(rendered).not.toContain("Friction");
    expect(rendered).not.toContain("file_churn");
    expect(rendered).not.toContain("heuristic-only");
    expect(rendered).not.toContain("Main cause");
  });
});

async function habitBundleFromFixtures(names: string[]) {
  const inputs: PromptHabitSessionInput[] = [];
  for (const name of names) {
    const session = normalizeCodexSession(parseCodexJsonl(await readFixture(name)), {
      transcriptPath: `/tmp/${name}`
    });
    const signals = extractSignals(session);
    const evidence = buildEvidenceBundle(session, signals);
    inputs.push({
      session,
      signals,
      evidence,
      score: signals.length > 0 ? 60 : 10,
      mainIssue: signals[0]?.kind ?? "low_friction",
      chatSummary: session.turns[0]?.userMessages[0]?.text ?? "Synthetic session"
    });
  }
  return buildPromptHabitBundle(inputs, { language: "ko" });
}

function validHabitReport(): PromptHabitReport {
  return {
    schemaVersion: 1,
    language: "ko",
    oneLineTake: "최근 요청은 계획을 잘 주지만, 중요한 기준이 뒤에 붙을 때 왕복이 커졌습니다.",
    strengths: [
      {
        title: "계획을 먼저 주는 편",
        detail: "구현 계획과 검증 흐름을 직접 적어서 에이전트가 따라갈 구조를 만듭니다.",
        evidenceSessionIds: ["sess-plan-followups"]
      }
    ],
    risks: [
      {
        title: "중요한 기준이 뒤에 붙음",
        detail: "처음 문장에 유지해야 할 조건과 완료 기준이 같이 들어가면 왕복이 줄어듭니다.",
        evidenceSessionIds: ["sess-late"]
      }
    ],
    repeatedPhrases: ["PLEASE IMPLEMENT THIS PLAN", "진행해줘"],
    defaultRewrite:
      "PLEASE IMPLEMENT THIS PLAN. 다만 시작 전에 제품 기준부터 확인해줘. 구현은 범위가 맞다고 판단되면 진행하고, 끝나기 전에 pnpm test와 pnpm typecheck를 실행해줘.",
    evidenceSessions: [
      {
        index: 1,
        sessionId: "sess-late",
        title: "Refactor the auth middleware.",
        whyRelevant: "중요한 조건이 뒤늦게 나온 사례입니다."
      },
      {
        index: 2,
        sessionId: "sess-plan-followups",
        title: "Bootstrap the CLI project.",
        whyRelevant: "계획을 먼저 주는 표현이 보이는 사례입니다."
      }
    ],
    confidence: "medium",
    limitations: ["Synthetic habit report."]
  };
}
