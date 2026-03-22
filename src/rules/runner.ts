import type { Diagnostic } from "../types/diagnostic.js"
import type { Rule, RuleContext } from "../types/rule.js"

export const runRules = async (
  rules: readonly Rule[],
  context: RuleContext,
): Promise<readonly Diagnostic[]> => {
  const results = await Promise.all(rules.map((r) => r.check(context)))
  return results.flat()
}
