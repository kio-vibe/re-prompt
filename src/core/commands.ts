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
  return /^\s*PLEASE IMPLEMENT THIS PLAN\s*:/i.test(text);
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
