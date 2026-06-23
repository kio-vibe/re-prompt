import type { Engine } from "../core/types.js";

export { type Engine };

export function parseEngine(engine: string): Engine {
  if (engine === "none" || engine === "codex" || engine === "claude") {
    return engine;
  }
  throw new Error(`Unsupported engine "${engine}". Use none, codex, or claude.`);
}

export function assertHeuristicOnlyEngine(engine: string, command: string): asserts engine is "none" {
  if (engine !== "none") {
  throw new Error(`${command} is heuristic-only. Use --engine none, or run coach/retro/last with --engine ${engine}.`);
  }
}
