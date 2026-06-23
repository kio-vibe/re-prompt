import type { PromptCoachReport } from "../core/types.js";

export function renderPromptCoachReport(report: PromptCoachReport): string {
  if (report.language === "ko") {
    return [
      "# re-prompt coach",
      "",
      report.analysis ? `분석: requested ${report.analysis.requestedEngine}, used ${report.analysis.usedEngine}${report.analysis.fallback ? " (fallback)" : ""}` : "",
      report.analysis?.fallbackReason ? `참고: ${report.analysis.fallbackReason}` : "",
      "",
      "## 내 판단은 이거예요",
      "",
      report.oneLineTake,
      "",
      "## 네가 실제로 이렇게 말했어요",
      "",
      report.whatYouActuallyWrote,
      "",
      "## 여기서 애매했던 건 이 부분이에요",
      "",
      report.whereItWentWrong,
      "",
      "## 네 말투로 고치면 이렇게예요",
      "",
      "```txt",
      report.rewriteInYourVoice,
      "```",
      "",
      "## 왜 이게 더 나은가",
      "",
      report.whyThisWorks,
      "",
      "## 다음엔 이 한 문장부터 넣으면 돼요",
      "",
      "```txt",
      report.rescueLine,
      "```",
      "",
      "## 한계",
      "",
      ...report.limitations.map((item) => `- ${item}`),
      ""
    ]
      .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
      .join("\n");
  }

  return [
    "# re-prompt coach",
    "",
    report.analysis ? `Analysis: requested ${report.analysis.requestedEngine}, used ${report.analysis.usedEngine}${report.analysis.fallback ? " (fallback)" : ""}` : "",
    report.analysis?.fallbackReason ? `Note: ${report.analysis.fallbackReason}` : "",
    "",
    "## My take",
    "",
    report.oneLineTake,
    "",
    "## What you actually wrote",
    "",
    report.whatYouActuallyWrote,
    "",
    "## Where the wording got in the way",
    "",
    report.whereItWentWrong,
    "",
    "## Rewritten in your voice",
    "",
    "```txt",
    report.rewriteInYourVoice,
    "```",
    "",
    "## Why this works better",
    "",
    report.whyThisWorks,
    "",
    "## Rescue line for next time",
    "",
    "```txt",
    report.rescueLine,
    "```",
    "",
    "## Limitations",
    "",
    ...report.limitations.map((item) => `- ${item}`),
    ""
  ]
    .filter((line, index, lines) => !(line === "" && lines[index - 1] === ""))
    .join("\n");
}
