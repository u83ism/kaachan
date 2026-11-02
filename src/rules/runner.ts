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

/** Catalog rules that are reported only when listed in `enabledRules` (marked "opt-in" in the catalog summary) */
export const OPT_IN_RULES: readonly string[] = ["defer-suggestion"]

const isReported = (ruleId: string, context: RuleContext): boolean =>
  !context.config.disabledRules.includes(ruleId) &&
  (!OPT_IN_RULES.includes(ruleId) || (context.config.enabledRules ?? []).includes(ruleId))

/** Run the rule modules and give each finding the catalog severity; findings of inactive rules are dropped */
export const runRules = async (
  rules: readonly Rule[],
  context: RuleContext,
): Promise<readonly Diagnostic[]> => {
  const results = await Promise.all(rules.map((r) => r.check(context)))
  return results
    .flat()
    .filter((f) => isReported(f.ruleId, context))
    .flatMap((f) => toDiagnostic(f, context.level))
}
