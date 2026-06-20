import type { EvidenceBundle, RetroReport } from "../core/types.js";

export interface AnalyzerOptions {
  engine: "none";
}

export interface Analyzer {
  analyze(bundle: EvidenceBundle, options: AnalyzerOptions): Promise<RetroReport>;
}
