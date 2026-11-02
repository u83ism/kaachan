export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export type { Severity, DiagnosticLocation, Finding, Diagnostic } from "./diagnostic.js"
export type {
  SourceFileInfo,
  DomainFolder,
  OrchestrateFolder,
  LayerFiles,
  ProjectSnapshot,
  SlimeConfig,
} from "./analysis.js"
export type { FatThresholds, KaachanConfig, AnalysisResult, DetectedAnalysisResult } from "./config.js"
export { isLevelDetected } from "./config.js"
export type { RuleContext, Rule, RuleResult } from "./rule.js"
