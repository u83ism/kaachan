import { getRuleDefinition, getRuleSeverity } from "@u83ism/architecture-rules"
import type { ArchitectureLevel } from "../level/types.js"
import type { Diagnostic, Finding } from "../types/diagnostic.js"
import type { Rule, RuleContext } from "../types/rule.js"

/** Severity of a catalog rule at the level, or undefined when the rule is unknown or inactive */
export const severityAt = (ruleId: string, level: ArchitectureLevel): Diagnostic["severity"] | undefined => {
  const rule = getRuleDefinition(ruleId)
  return rule === undefined ? undefined : getRuleSeverity(rule, level)
}

const toDiagnostic = (finding: Finding, level: ArchitectureLevel): readonly Diagnostic[] => {
  const severity = severityAt(finding.ruleId, level)
  return severity === undefined ? [] : [{ ...finding, severity }]
}

/** Run the rule modules and give each finding the catalog severity; findings of inactive rules are dropped */
export const runRules = async (
  rules: readonly Rule[],
  context: RuleContext,
): Promise<readonly Diagnostic[]> => {
  const results = await Promise.all(rules.map((r) => r.check(context)))
  return results
    .flat()
    .filter((f) => !context.config.disabledRules.includes(f.ruleId))
    .flatMap((f) => toDiagnostic(f, context.level))
}
