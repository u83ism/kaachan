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

/** `level` is null when no level was detected; no rules run in that case */
export interface AnalysisResult {
  readonly level: ArchitectureLevel | null
  readonly levelEvidence: readonly string[]
  readonly missingForNext: readonly string[]
  readonly diagnostics: readonly Diagnostic[]
}

export type DetectedAnalysisResult = AnalysisResult & { readonly level: ArchitectureLevel }

export const isLevelDetected = (result: AnalysisResult): result is DetectedAnalysisResult =>
  result.level !== null
