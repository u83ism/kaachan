import type { ArchitectureLevel } from "../level/types.js"
import type { Rule } from "../types/rule.js"
import { severityAt } from "./runner.js"
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
import { eventsValidationRule } from "./implementations/events-validation.js"
import { crossFolderConcernsRule } from "./implementations/cross-folder-concerns.js"
import { infrastructureBoundaryRule } from "./implementations/infrastructure-boundary.js"
import { cqrsEnforcementRule } from "./implementations/cqrs-enforcement.js"
import { routeInlineRule } from "./implementations/route-inline.js"
import { workflowThrowsRule } from "./implementations/workflow-throws.js"
import { slimeConfigHintRule } from "./implementations/slime-config-hint.js"
import { routeNamespaceRule } from "./implementations/route-namespace.js"
import { workflowHttpRule } from "./implementations/workflow-http.js"
import { storeFilterRule } from "./implementations/store-filter.js"
import { storeInLoopRule } from "./implementations/store-in-loop.js"
import { logicPrefixRule } from "./implementations/logic-prefix.js"
import { folderNamesRule } from "./implementations/folder-names.js"
import { errorCodesRule } from "./implementations/error-codes.js"
import { sharedLayerRule } from "./implementations/shared-layer.js"
import { routeSunsetRule } from "./implementations/route-sunset.js"
import { tableOwnershipRule } from "./implementations/table-ownership.js"

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
  eventsValidationRule,
  crossFolderConcernsRule,
  infrastructureBoundaryRule,
  cqrsEnforcementRule,
  routeInlineRule,
  workflowThrowsRule,
  slimeConfigHintRule,
  routeNamespaceRule,
  workflowHttpRule,
  storeFilterRule,
  storeInLoopRule,
  logicPrefixRule,
  folderNamesRule,
  errorCodesRule,
  sharedLayerRule,
  routeSunsetRule,
  tableOwnershipRule,
]

export const registerRule = (rules: readonly Rule[], rule: Rule): readonly Rule[] => [
  ...rules,
  rule,
]

/** Rule modules with at least one catalog rule active at the level */
export const getRulesForLevel = (
  rules: readonly Rule[],
  level: ArchitectureLevel,
): readonly Rule[] => rules.filter((r) => r.ruleIds.some((id) => severityAt(id, level) !== undefined))
