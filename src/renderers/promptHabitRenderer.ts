import type { PromptHabitReport } from "../core/types.js";

export function renderPromptHabitReport(report: PromptHabitReport): string {
  return report.language === "ko" ? renderKorean(report) : renderEnglish(report);
}

function renderKorean(report: PromptHabitReport): string {
  return [
    "# 최근 세션에서 보이는 프롬프트 습관",
    "",
    report.analysis ? renderKoreanAnalysis(report) : undefined,
    report.oneLineTake,
    "",
    "## 다음엔 이렇게 시작하면 좋아요",
    "",
    fenced(report.defaultRewrite),
    "",
    "## 좋은 점",
    "",
    ...renderBullets(report.strengths.map((item) => `${item.title}: ${item.detail}`)),
    "",
    "## 아쉬운 점",
    "",
    ...renderBullets(report.risks.map((item) => `${item.title}: ${item.detail}`)),
    "",
    "## 자주 보이는 표현",
    "",
    ...renderBullets(report.repeatedPhrases),
    "",
    "## 근거가 된 세션",
    "",
    ...renderEvidenceSessions(report),
    "",
    "자세히 볼 번호만 말해줘. 예: `1번`",
    "",
    ...renderLimitations(report.limitations, "ko")
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function renderEnglish(report: PromptHabitReport): string {
  return [
    "# Prompt Habits From Recent Sessions",
    "",
    report.analysis ? renderEnglishAnalysis(report) : undefined,
    report.oneLineTake,
    "",
    "## Say This Next Time",
    "",
    fenced(report.defaultRewrite),
    "",
    "## Strengths",
    "",
    ...renderBullets(report.strengths.map((item) => `${item.title}: ${item.detail}`)),
    "",
    "## Risks",
    "",
    ...renderBullets(report.risks.map((item) => `${item.title}: ${item.detail}`)),
    "",
    "## Repeated Phrases",
    "",
    ...renderBullets(report.repeatedPhrases),
    "",
    "## Evidence Sessions",
    "",
    ...renderEvidenceSessions(report),
    "",
    "Reply with just the number to inspect one. Example: `1`",
    "",
    ...renderLimitations(report.limitations, "en")
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n");
}

function renderKoreanAnalysis(report: PromptHabitReport): string {
  const analysis = report.analysis!;
  if (!analysis.fallback) {
    return `분석: ${analysis.usedEngine}`;
  }
  return `분석: ${analysis.requestedEngine} 실패 후 낮은 확신의 로컬 fallback${analysis.fallbackReason ? ` (${analysis.fallbackReason})` : ""}`;
}

function renderEnglishAnalysis(report: PromptHabitReport): string {
  const analysis = report.analysis!;
  if (!analysis.fallback) {
    return `Analysis: ${analysis.usedEngine}`;
  }
  return `Analysis: ${analysis.requestedEngine} failed, using low-confidence local fallback${analysis.fallbackReason ? ` (${analysis.fallbackReason})` : ""}`;
}

function renderBullets(items: string[]): string[] {
  if (items.length === 0) {
    return ["- Not enough evidence yet."];
  }
  return items.map((item) => `- ${item}`);
}

function renderEvidenceSessions(report: PromptHabitReport): string[] {
  if (report.evidenceSessions.length === 0) {
    return [report.language === "ko" ? "- 아직 근거 세션을 고르지 못했습니다." : "- No evidence sessions yet."];
  }
  return report.evidenceSessions.flatMap((session) => [
    `${session.index}. ${session.title}`,
    report.language === "ko" ? `   왜 근거인가: ${session.whyRelevant}` : `   Why it matters: ${session.whyRelevant}`,
    `   Session: ${session.sessionId}`
  ]);
}

function renderLimitations(limitations: string[], language: "en" | "ko"): string[] {
  if (limitations.length === 0) {
    return [];
  }
  return [language === "ko" ? "## 한계" : "## Limitations", "", ...renderBullets(limitations)];
}

function fenced(value: string): string {
  return ["```txt", value, "```"].join("\n");
}
