import { buildPromptCoachBundle } from "../../src/core/coach/buildPromptCoachBundle.js";
import { redactValue } from "../../src/core/privacy/redact.js";
import { extractSignals } from "../../src/core/signals/index.js";
import { buildEvidenceBundle } from "../../src/core/evidence/buildEvidenceBundle.js";
import { normalizeCodexSession } from "../../src/sources/codex/normalizeCodexSession.js";
import { parseCodexJsonl } from "../../src/sources/codex/parseCodexJsonl.js";
import { parsePromptCoachReport } from "../../src/analyzers/coachSchema.js";
import { buildFallbackPromptCoachReport, lintPromptCoachReport } from "../../src/analyzers/promptCoachAnalyzer.js";
import { renderPromptCoachReport } from "../../src/renderers/promptCoachRenderer.js";
import { readFixture } from "../helpers.js";
import type { NormalizedSession, PromptCoachReport } from "../../src/core/types.js";

describe("prompt coach", () => {
  it("builds a user-message-centered bundle without assistant or tool output", async () => {
    const bundle = await coachBundleFromFixture("simple-success.jsonl");
    const serialized = JSON.stringify(bundle);

    expect(bundle.userMessages).toEqual([
      expect.objectContaining({
        turnIndex: 1,
        kind: "initial",
        text: "Update README title only."
      })
    ]);
    expect(serialized).not.toContain("I will inspect the README");
    expect(serialized).not.toContain("PASS tests/readme.test.ts");
    expect(serialized).not.toContain("Old title");
  });

  it("redacts local paths and secrets before coach analysis", async () => {
    const bundle = await coachBundleFromFixture("attachment-path-request.jsonl");
    bundle.userMessages.push({
      turnIndex: 2,
      kind: "follow_up",
      text: "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456 and Bearer abcdefghijklmnopqrstuvwxyz123456",
      whyIncluded: "Synthetic secret check."
    });

    const redacted = redactValue(bundle).value;
    const serialized = JSON.stringify(redacted);

    expect(serialized).not.toContain("/Users/alice");
    expect(serialized).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).not.toContain("Bearer abcdefghijklmnopqrstuvwxyz123456");
    expect(serialized).toContain("~/.codex/attachments");
    expect(serialized).toContain("[REDACTED_ENV_SECRET]");
    expect(serialized).toContain("Bearer [REDACTED_TOKEN]");
  });

  it("does not treat copied skill transcript chrome as user voice", () => {
    const session = minimalSessionWithUserText(`해봤는데 지금 상태에 대해 어떻게 생각해?

# Run re-prompt go

> [$re-prompt-go](/Users/alice/.codex/skills/re-prompt-go/SKILL.md)

<details><summary>1 previous message</summary>

> <details><summary>Ran 2 commands</summary>
>
> - Ran \`re-prompt --version\`
> - Ran \`re-prompt go --next-style plugin --language auto\`
>
> </details>

</details>`);
    const evidence = buildEvidenceBundle(session, []);
    const bundle = buildPromptCoachBundle(session, evidence, { language: "ko" });

    expect(bundle.userMessages[0]?.text).toContain("해봤는데 지금 상태에 대해 어떻게 생각해?");
    expect(bundle.userMessages[0]?.text).not.toContain("$re-prompt-go");
    expect(bundle.userMessages[0]?.text).not.toContain("Run re-prompt go");
    expect(bundle.userMessages[0]?.text).not.toContain("<details>");
    expect(bundle.userMessages[0]?.text).not.toContain("Ran 2 commands");
  });

  it("validates prompt coach reports and rejects generic rewrites", async () => {
    const bundle = await coachBundleFromFixture("plan-followups-not-late-constraint.jsonl");
    const report = parsePromptCoachReport(validCoachReport());

    expect(report.schemaVersion).toBe(1);
    expect(lintPromptCoachReport(report, bundle)).toEqual([]);

    const generic: PromptCoachReport = {
      ...report,
      rewriteInYourVoice: "Be more specific."
    };
    expect(lintPromptCoachReport(generic, bundle)).toContain("generic_advice");
  });

  it("renders a short rewrite before the fuller coach rewrite", () => {
    const report = parsePromptCoachReport({
      ...validCoachReport(),
      shortRewriteInYourVoice: "Bootstrap만 해줘. release gate는 빼고, 끝나기 전에 테스트만 확인해줘."
    });

    const rendered = renderPromptCoachReport(report);

    expect(rendered).toContain("## 다음엔 이렇게 말하면 돼요");
    expect(rendered).toContain("## 조금 더 탄탄하게 쓰면");
    expect(rendered.indexOf("Bootstrap만 해줘")).toBeLessThan(rendered.indexOf("Bootstrap the CLI project. 다만"));
    expect(rendered).not.toContain("## Rewritten in your voice");
  });

  it("renders old coach reports without short rewrites by falling back to the full rewrite", () => {
    const report = parsePromptCoachReport(validCoachReport());
    const rendered = renderPromptCoachReport(report);

    expect(rendered).toContain("## 다음엔 이렇게 말하면 돼요");
    expect(rendered).toContain("Bootstrap the CLI project. 다만 이번 세션에서는 CLI 골격만 만들고");
  });

  it("builds a low-confidence fallback coach report", async () => {
    const bundle = await coachBundleFromFixture("plan-followups-not-late-constraint.jsonl");
    const report = buildFallbackPromptCoachReport(bundle, {
      engine: "codex",
      language: "ko",
      fallback: true,
      fallbackReason: "codex CLI missing"
    });

    expect(report.confidence).toBe("low");
    expect(report.analysis).toMatchObject({ requestedEngine: "codex", usedEngine: "none", fallback: true });
    expect(report.analysis?.fallbackReason).toContain("codex CLI missing");
    expect(report.shortRewriteInYourVoice).toContain("범위 먼저 좁히고");
    expect(report.rewriteInYourVoice).toContain("Bootstrap the CLI project");
  });
});

async function coachBundleFromFixture(name: string) {
  const session = normalizeCodexSession(parseCodexJsonl(await readFixture(name)), {
    transcriptPath: `/tmp/${name}`
  });
  const signals = extractSignals(session);
  const evidence = buildEvidenceBundle(session, signals);
  return buildPromptCoachBundle(session, evidence, { language: "auto" });
}

function validCoachReport(): PromptCoachReport {
  return {
    schemaVersion: 1,
    session: {
      source: "codex",
      sessionId: "sess-plan-followups",
      title: "Prompt coach",
      confidence: "medium"
    },
    language: "ko",
    oneLineTake: "Bootstrap 요청은 짧았고, release gate 계획은 뒤에 붙어서 범위가 커졌습니다.",
    whatYouActuallyWrote: "처음에는 Bootstrap the CLI project라고 말했고, 뒤에는 Release gate 계획을 붙였습니다.",
    whereItWentWrong: "Bootstrap이라는 말만으로는 유지할 범위와 검증 기준이 충분히 고정되지 않았습니다.",
    rewriteInYourVoice:
      "Bootstrap the CLI project. 다만 이번 세션에서는 CLI 골격만 만들고, release gate나 태그 작업은 하지 마. 완료 전에는 pnpm test, pnpm typecheck, pnpm build를 실행해줘.",
    whyThisWorks: "원래 짧은 요청 구조를 유지하면서 범위와 검증 기준을 앞에 붙였기 때문입니다.",
    rescueLine: "여기서 멈추고 Bootstrap 범위인지 release gate 범위인지 먼저 분리해줘.",
    confidence: "medium",
    limitations: ["Synthetic coach report."]
  };
}

function minimalSessionWithUserText(text: string): NormalizedSession {
  return {
    source: "codex",
    sessionId: "coach-skill-transcript",
    transcriptPath: "/tmp/coach-skill-transcript.jsonl",
    turns: [
      {
        index: 1,
        userMessages: [{ text }],
        assistantMessages: [],
        toolEvents: [],
        fileChanges: [],
        commandExecutions: [],
        planUpdates: []
      }
    ],
    rawStats: {
      rawLineCount: 1,
      parseErrorCount: 0,
      unknownEventCount: 0
    }
  };
}
