import { detectLevel } from "../level/detector.js"
import type { KaachanConfig, AnalysisResult } from "../types/config.js"
import type { Result } from "../types/index.js"
import { scanProject } from "./scanner.js"

export const analyze = async (config: KaachanConfig): Promise<Result<AnalysisResult>> => {
  const scanResult = scanProject(config.rootDir)
  if (!scanResult.ok) return { ok: false, error: scanResult.error }

  const snapshot = scanResult.value
  const levelResult = detectLevel(snapshot)

  return {
    ok: true,
    value: {
      level: levelResult.level,
      levelEvidence: levelResult.evidence,
      missingForNext: levelResult.missingForNext,
      diagnostics: [],
    },
  }
}
