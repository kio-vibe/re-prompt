import { existsSync } from "node:fs";
import { open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import fg from "fast-glob";
import { parseCodexJsonl } from "./parseCodexJsonl.js";
import { getObject, asString } from "../../core/text.js";

export interface SessionCandidate {
  source: "codex";
  sessionId: string;
  transcriptPath: string;
  mtimeMs: number;
  sizeBytes: number;
  cwd?: string;
  startedAt?: string;
}

export interface LocateCodexSessionsOptions {
  codexHome?: string;
  repoPath?: string;
  metaReadBytes?: number;
}

const DEFAULT_META_READ_BYTES = 64 * 1024;

export function defaultCodexHome(): string {
  return process.env.CODEX_HOME ? resolve(process.env.CODEX_HOME) : join(homedir(), ".codex");
}

export async function locateCodexSessions(options: LocateCodexSessionsOptions = {}): Promise<SessionCandidate[]> {
  const codexHome = options.codexHome ?? defaultCodexHome();
  const sessionsDir = join(codexHome, "sessions");
  if (!existsSync(sessionsDir)) {
    return [];
  }

  const files = await fg("**/rollout-*.jsonl", {
    cwd: sessionsDir,
    absolute: true,
    onlyFiles: true,
    dot: true
  });

  const candidates = await Promise.all(
    files.map(async (file) => {
      const [fileStat, meta] = await Promise.all([
        stat(file),
        readSessionMetaPrefix(file, options.metaReadBytes ?? DEFAULT_META_READ_BYTES)
      ]);
      return {
        source: "codex" as const,
        sessionId: meta.sessionId ?? sessionIdFromPath(file),
        transcriptPath: file,
        mtimeMs: fileStat.mtimeMs,
        sizeBytes: fileStat.size,
        cwd: meta.cwd,
        startedAt: meta.startedAt
      };
    })
  );

  const filtered = options.repoPath
    ? candidates.filter((candidate) => !candidate.cwd || resolve(candidate.cwd) === resolve(options.repoPath!))
    : candidates;

  return filtered.sort((a, b) => b.mtimeMs - a.mtimeMs || b.transcriptPath.localeCompare(a.transcriptPath));
}

export async function resolveSessionReference(
  reference: string,
  options: LocateCodexSessionsOptions = {}
): Promise<SessionCandidate> {
  const path = expandHome(reference);
  if (isAbsolute(path) && existsSync(path)) {
    const [fileStat, meta] = await Promise.all([
      stat(path),
      readSessionMetaPrefix(path, options.metaReadBytes ?? DEFAULT_META_READ_BYTES)
    ]);
    return {
      source: "codex",
      sessionId: meta.sessionId ?? sessionIdFromPath(path),
      transcriptPath: path,
      mtimeMs: fileStat.mtimeMs,
      sizeBytes: fileStat.size,
      cwd: meta.cwd,
      startedAt: meta.startedAt
    };
  }

  const sessions = await locateCodexSessions(options);
  const match = sessions.find(
    (session) => session.sessionId === reference || session.sessionId.includes(reference) || session.transcriptPath.includes(reference)
  );
  if (!match) {
    throw new Error(`No Codex session found for "${reference}".`);
  }
  return match;
}

export async function readSessionMetaPrefix(
  path: string,
  maxBytes = DEFAULT_META_READ_BYTES
): Promise<{ sessionId?: string; cwd?: string; startedAt?: string }> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return readSessionMeta(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await handle.close();
  }
}

function readSessionMeta(content: string): { sessionId?: string; cwd?: string; startedAt?: string } {
  const parsed = parseCodexJsonl(content.split(/\r?\n/).slice(0, 20).join("\n"));
  const event = parsed.events.find((item) => item.type === "session_meta");
  const payload = getObject(event?.payload);
  return {
    sessionId: asString(payload?.id),
    cwd: asString(payload?.cwd),
    startedAt: asString(payload?.timestamp)
  };
}

function sessionIdFromPath(path: string): string {
  const match = path.match(/([0-9a-f]{8,}(?:-[0-9a-f]{4,})+)/i);
  return match?.[1] ?? path;
}

function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}
