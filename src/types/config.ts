import type { ArchitectureLevel } from "../level/types.js"
import type { Diagnostic } from "./diagnostic.js"

export interface FatThresholds {
  readonly hintLines: number
  readonly hintFunctions: number
  readonly warningLines: number
  readonly errorLogicFolderLines: number
}

export interface KaachanConfig {
  readonly rootDir: string
  readonly disabledRules: readonly string[]
  readonly thresholds: FatThresholds
}

export interface AnalysisResult {
  readonly level: ArchitectureLevel
  readonly levelEvidence: readonly string[]
  readonly missingForNext: readonly string[]
  readonly diagnostics: readonly Diagnostic[]
}
