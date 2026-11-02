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
import { readSlimeConfig } from "./slime-config.js"

const pad2 = (n: number): string => String(n).padStart(2, "0")

/** The current local date as YYYY-MM-DD */
const currentDate = (): string => {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

const runActiveRules = async (
  config: KaachanConfig,
  rules: readonly Rule[],
  snapshot: ProjectSnapshot,
  level: ArchitectureLevel,
): Promise<Result<readonly Diagnostic[]>> => {
  const activeRules = getRulesForLevel(rules, level).filter(
    (r) => !config.disabledRules.includes(r.id),
  )
  if (activeRules.length === 0) return { ok: true, value: [] }

  const morphProject = createMorphProject(config.rootDir)
  const slimeConfig = readSlimeConfig(config.rootDir, morphProject)
  if (!slimeConfig.ok) return slimeConfig

  const context: RuleContext = {
    rootDir: config.rootDir,
    level,
    snapshot,
    slimeConfig: slimeConfig.value,
    config,
    morphProject,
    today: config.today ?? currentDate(),
  }
  return { ok: true, value: await runRules(activeRules, context) }
}

export const analyze = async (
  config: KaachanConfig,
  rules: readonly Rule[] = BUILT_IN_RULES,
): Promise<Result<AnalysisResult>> => {
  const scanResult = scanProject(config.rootDir)
  if (!scanResult.ok) return { ok: false, error: scanResult.error }

  const snapshot = scanResult.value
  const levelResult = detectLevel(snapshot)

  const diagnostics: Result<readonly Diagnostic[]> =
    levelResult.level === null
      ? { ok: true, value: [] }
      : await runActiveRules(config, rules, snapshot, levelResult.level)
  if (!diagnostics.ok) return diagnostics

  return {
    ok: true,
    value: {
      level: levelResult.level,
      levelEvidence: levelResult.evidence,
      missingForNext: levelResult.missingForNext,
      diagnostics: diagnostics.value,
    },
  }
}
