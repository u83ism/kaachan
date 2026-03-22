export { analyze } from "./analyzer.js"
export { scanProject } from "./scanner.js"
export { detectLevel } from "../level/detector.js"
export { BUILT_IN_RULES, getRulesForLevel, registerRule, runRules } from "../rules/index.js"

export type { ArchitectureLevel, LevelResult } from "../level/types.js"
export type {
  Result,
  Diagnostic,
  Severity,
  DiagnosticLocation,
  ProjectSnapshot,
  SourceFileInfo,
  DomainFolder,
  FatThresholds,
  KaachanConfig,
  AnalysisResult,
  RuleContext,
  Rule,
  RuleResult,
} from "../types/index.js"
