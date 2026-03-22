export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export type { Severity, DiagnosticLocation, Diagnostic } from "./diagnostic.js"
export type { SourceFileInfo, DomainFolder, ProjectSnapshot } from "./analysis.js"
export type { FatThresholds, KaachanConfig, AnalysisResult } from "./config.js"
export type { RuleContext, Rule, RuleResult } from "./rule.js"
