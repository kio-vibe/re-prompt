import { isImplementationPlanPrompt, isLikelyConstraintMessage, isLikelyUserCorrection } from "../../src/core/commands.js";

describe("command and prompt classifiers", () => {
  it("detects explicit corrections and constraints", () => {
    expect(isLikelyUserCorrection("아니, 그게 아니라 기존 API는 유지해야지")).toBe(true);
    expect(isLikelyUserCorrection("Don't change the public API")).toBe(true);
    expect(isLikelyConstraintMessage("Don't change the public API")).toBe(true);
  });

  it("does not treat connective phrasing or release notes as corrections", () => {
    expect(isLikelyUserCorrection("아니면 scan 후 retro를 실행하세요")).toBe(false);
    expect(isLikelyUserCorrection("No telemetry")).toBe(false);
  });

  it("treats long release-plan text as a plan rather than a correction", () => {
    const releasePlan = `좋습니다. 이건 release-quality 후보가 아니라 tagged release 후보입니다.

# re-prompt v0.1.0 GitHub Release + 0.1.1 Polish Plan

## Summary

Do not move the existing tag. Create the GitHub Release from the existing tag, then start a polish branch.

## Release Steps

Create the release from v0.1.0.

## Test Plan

Run pnpm test, pnpm typecheck, and pnpm build.

## Safety and privacy

- No telemetry
- Local-first`;

    expect(isImplementationPlanPrompt(releasePlan)).toBe(true);
    expect(isLikelyUserCorrection(releasePlan)).toBe(false);
  });

  it("treats Korean PR and release guidance as a plan rather than a correction", () => {
    const releaseGuidance = `좋습니다. 이건 v0.1.1 patch 후보로 보면 됩니다.

## 바로 PR 만들기

\`\`\`bash
gh pr create --base main --head codex/re-prompt-0.1.1-polish
\`\`\`

## merge 전 체크

\`\`\`bash
pnpm test
pnpm typecheck
pnpm build
\`\`\`

## merge 후 v0.1.1 태그

\`\`\`bash
git tag -a v0.1.1 -m "v0.1.1"
git push origin v0.1.1
\`\`\`

위험한 완화:
"아니, 그게 아니라..."까지 놓치면 안 됩니다.`;

    expect(isImplementationPlanPrompt(releaseGuidance)).toBe(true);
    expect(isLikelyUserCorrection(releaseGuidance)).toBe(false);
    expect(isLikelyConstraintMessage(releaseGuidance)).toBe(false);
  });
});
