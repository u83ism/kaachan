import type { ArchitectureLevel } from "../level/types.js"
import type { Rule } from "../types/rule.js"
import { fatWorkflowRule } from "./implementations/fat-workflow.js"
import { fatParseRule } from "./implementations/fat-parse.js"
import { parseViolationsRule } from "./implementations/parse-violations.js"
import { fatLogicRule } from "./implementations/fat-logic.js"
import { repoNamingRule } from "./implementations/repo-naming.js"
import { logicImportsRule } from "./implementations/logic-imports.js"
import { logicThrowsRule } from "./implementations/logic-throws.js"
import { logicTestsRule } from "./implementations/logic-tests.js"
import { depDirectionRule } from "./implementations/dep-direction.js"

export const BUILT_IN_RULES: readonly Rule[] = [
  fatWorkflowRule,
  fatParseRule,
  parseViolationsRule,
  repoNamingRule,
  logicImportsRule,
  logicThrowsRule,
  logicTestsRule,
  depDirectionRule,
  fatLogicRule,
]

export const registerRule = (rules: readonly Rule[], rule: Rule): readonly Rule[] => [
  ...rules,
  rule,
]

export const getRulesForLevel = (
  rules: readonly Rule[],
  level: ArchitectureLevel,
): readonly Rule[] => rules.filter((r) => r.activateFromLevel <= level)
