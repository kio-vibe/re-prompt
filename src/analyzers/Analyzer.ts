import type { EvidenceBundle, RetroReport } from "../core/types.js";
import type { Engine } from "./engine.js";

export interface AnalyzerOptions {
  engine: Engine;
}

export interface Analyzer {
  analyze(bundle: EvidenceBundle, options: AnalyzerOptions): Promise<RetroReport>;
}
