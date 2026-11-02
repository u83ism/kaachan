import { detectLevel } from "../level/detector.js"
import { BUILT_IN_RULES, getRulesForLevel } from "../rules/registry.js"
import { runRules } from "../rules/runner.js"
import type { KaachanConfig, AnalysisResult } from "../types/config.js"
import type { ArchitectureLevel } from "../level/types.js"
import type { Diagnostic } from "../types/diagnostic.js"
import type { ProjectSnapshot } from "../types/analysis.js"
import type { Rule, RuleContext } from "../types/rule.js"
import type { Result } from "../types/index.js"
import { scanProject } from "./scanner.js"
import { createMorphProject } from "./project.js"

const runActiveRules = async (
  config: KaachanConfig,
  rules: readonly Rule[],
  snapshot: ProjectSnapshot,
  level: ArchitectureLevel,
): Promise<readonly Diagnostic[]> => {
  const activeRules = getRulesForLevel(rules, level).filter(
    (r) => !config.disabledRules.includes(r.id),
  )
  if (activeRules.length === 0) return []

  const context: RuleContext = {
    rootDir: config.rootDir,
    level,
    snapshot,
    config,
    morphProject: createMorphProject(config.rootDir),
  }
  return runRules(activeRules, context)
}

export const analyze = async (
  config: KaachanConfig,
  rules: readonly Rule[] = BUILT_IN_RULES,
): Promise<Result<AnalysisResult>> => {
  const scanResult = scanProject(config.rootDir)
  if (!scanResult.ok) return { ok: false, error: scanResult.error }

  const snapshot = scanResult.value
  const levelResult = detectLevel(snapshot)

  const diagnostics =
    levelResult.level === null ? [] : await runActiveRules(config, rules, snapshot, levelResult.level)

  return {
    ok: true,
    value: {
      level: levelResult.level,
      levelEvidence: levelResult.evidence,
      missingForNext: levelResult.missingForNext,
      diagnostics,
    },
  }
}
