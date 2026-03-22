import type { ArchitectureLevel } from "../level/types.js"
import type { Rule } from "../types/rule.js"

export const BUILT_IN_RULES: readonly Rule[] = []

export const registerRule = (rules: readonly Rule[], rule: Rule): readonly Rule[] => [
  ...rules,
  rule,
]

export const getRulesForLevel = (
  rules: readonly Rule[],
  level: ArchitectureLevel,
): readonly Rule[] => rules.filter((r) => r.activateFromLevel <= level)
