import type { ArchitectureLevel } from "../level/types.js"
import type { Rule } from "../types/rule.js"
import { fatWorkflowRule } from "./implementations/fat-workflow.js"
import { fatParseRule } from "./implementations/fat-parse.js"
import { parseViolationsRule } from "./implementations/parse-violations.js"
import { fatLogicRule } from "./implementations/fat-logic.js"
import { repoNamingRule } from "./implementations/repo-naming.js"
import { repoAdvancedRule } from "./implementations/repo-advanced.js"
import { logicImportsRule } from "./implementations/logic-imports.js"
import { logicThrowsRule } from "./implementations/logic-throws.js"
import { logicTestsRule } from "./implementations/logic-tests.js"
import { depDirectionRule } from "./implementations/dep-direction.js"
import { appLayerRule } from "./implementations/app-layer.js"
import { clientAclRule } from "./implementations/client-acl.js"
import { fatRoutingRule } from "./implementations/fat-routing.js"
import { nestedDomainRule } from "./implementations/nested-domain.js"
import { eventsValidationRule } from "./implementations/events-validation.js"
import { crossFolderConcernsRule } from "./implementations/cross-folder-concerns.js"

export const BUILT_IN_RULES: readonly Rule[] = [
  fatWorkflowRule,
  fatParseRule,
  parseViolationsRule,
  repoNamingRule,
  repoAdvancedRule,
  logicImportsRule,
  logicThrowsRule,
  logicTestsRule,
  depDirectionRule,
  appLayerRule,
  clientAclRule,
  fatLogicRule,
  fatRoutingRule,
  nestedDomainRule,
  eventsValidationRule,
  crossFolderConcernsRule,
]

export const registerRule = (rules: readonly Rule[], rule: Rule): readonly Rule[] => [
  ...rules,
  rule,
]

export const getRulesForLevel = (
  rules: readonly Rule[],
  level: ArchitectureLevel,
): readonly Rule[] => rules.filter((r) => r.activateFromLevel <= level)
