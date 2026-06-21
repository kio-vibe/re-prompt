const CORRECTION_RE =
  /\b(not what i asked|wrong|stop|revert|rollback|i said|don't change|why did you|that's not|you changed)\b|아니요|아니야|아닙니다|그게\s*아니라|그건\s*아니|이게\s*아니|틀렸|잘못\s*(했|한|된|됨|됐|바꿨|수정|고쳤|이해|짚었)|멈춰|되돌려|롤백|내가 말한 건|바꾸지 말랬|왜 바꿨어/i;
const CONSTRAINT_RE = /\b(must|don't|without|preserve|keep|maintain|never|do not)\b|기존|유지|바꾸지|건드리지/i;

export function isVerificationCommand(command: string): boolean {
  const trimmed = command.trim();
  return (
    /^(pnpm|npm|yarn|bun)\s+(test|typecheck|lint|build)\b/i.test(trimmed) ||
    /^(pnpm|npm|yarn|bun)\s+run\s+(test|typecheck|lint|build)\b/i.test(trimmed) ||
    /^pnpm\s+exec\s+(vitest|jest|tsc|eslint)\b/i.test(trimmed) ||
    /^(vitest|jest|pytest|rspec|tsc|eslint)\b/i.test(trimmed) ||
    /^cargo\s+test\b/i.test(trimmed) ||
    /^go\s+test\b/i.test(trimmed) ||
    /^node\s+dist\/cli\.js\s+(--help|doctor|scan|last|rules)\b/i.test(trimmed)
  );
}

export function isInspectionCommand(command: string): boolean {
  return /^(sed|cat|less|head|tail|rg|grep|find|ls|pwd)\b/i.test(command.trim());
}

export function isActionableFailedCommand(command: string): boolean {
  return !isInspectionCommand(command) || isVerificationCommand(command);
}

export function detectPackageManager(command: string): string | undefined {
  return command.trim().match(/^(pnpm|npm|yarn|bun|pip|poetry|uv|bundle|cargo|go)\b/i)?.[1];
}

export function isImplementationPlanPrompt(text: string): boolean {
  const preview = text.slice(0, 4000);
  if (/PLEASE IMPLEMENT THIS PLAN\s*:/i.test(preview)) {
    return true;
  }

  const hasPlanTitle = /^#{1,2}\s+.*\b(plan|release candidate|hardening|polish)\b/im.test(preview);
  const hasPlanSections =
    /^##\s+(Summary|Key Changes|Implementation|Implementation Changes|Execution Steps|Release Steps|Test Plan|Assumptions)\b/im.test(
      preview
    ) &&
    /^##\s+(Test Plan|Assumptions|Implementation|Implementation Changes|Execution Steps|Release Steps)\b/im.test(preview);
  const headingCount = preview.match(/^##\s+/gm)?.length ?? 0;
  const hasOperationalCommandBlock = /```[\s\S]*?\b(gh pr create|gh release create|git tag|git push|pnpm test|pnpm build|node dist\/cli\.js)\b[\s\S]*?```/i.test(
    preview
  );
  const hasReleaseWorkflowTerms = /\b(PR|pull request|release|tag|merge|v\d+\.\d+\.\d+)\b|릴리즈|태그|머지/i.test(
    preview
  );

  return (hasPlanTitle && hasPlanSections) || (headingCount >= 3 && hasOperationalCommandBlock && hasReleaseWorkflowTerms);
}

export function isLikelyUserCorrection(text: string): boolean {
  return CORRECTION_RE.test(text) && !isImplementationPlanPrompt(text);
}

export function isLikelyConstraintMessage(text: string): boolean {
  return CONSTRAINT_RE.test(text) && !isImplementationPlanPrompt(text);
}

export function fingerprintFailureOutput(output: string): string {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("{") && !line.startsWith("["))
    .filter((line) => /error|failed|fail|exception|traceback|panic|expected|oom|heap|out of memory/i.test(line))
    .slice(0, 3)
    .join("\n")
    .replace(/\d+/g, "<num>")
    .replace(/\/[^:\s]+/g, "<path>")
    .trim();
}
