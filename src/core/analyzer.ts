import { detectLevel } from "../level/detector.js"
import { BUILT_IN_RULES, getRulesForLevel } from "../rules/registry.js"
import { runRules } from "../rules/runner.js"
import type { KaachanConfig, AnalysisResult } from "../types/config.js"
import type { Rule, RuleContext } from "../types/rule.js"
import type { Result } from "../types/index.js"
import { scanProject } from "./scanner.js"
import { createMorphProject } from "./project.js"

export const analyze = async (
  config: KaachanConfig,
  rules: readonly Rule[] = BUILT_IN_RULES,
): Promise<Result<AnalysisResult>> => {
  const scanResult = scanProject(config.rootDir)
  if (!scanResult.ok) return { ok: false, error: scanResult.error }

  const snapshot = scanResult.value
  const levelResult = detectLevel(snapshot)

  const activeRules = getRulesForLevel(rules, levelResult.level).filter(
    (r) => !config.disabledRules.includes(r.id),
  )

  let diagnostics: Awaited<ReturnType<typeof runRules>> = []
  if (activeRules.length > 0) {
    const morphProject = createMorphProject(config.rootDir)
    const context: RuleContext = {
      rootDir: config.rootDir,
      level: levelResult.level,
      snapshot,
      config,
      morphProject,
    }
    diagnostics = await runRules(activeRules, context)
  }

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
