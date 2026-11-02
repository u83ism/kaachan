import { exportedFunctions, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "logic-missing-prefix",
] as const
type Id = (typeof RULE_IDS)[number]

/**
 * Leading words that state a judgment without naming a domain (`canEdit`, `isAdult`, `validateOrder`).
 * Business judgments carry the domain first (`userCanEdit`); domain calculations such as
 * `calcOrderTotal` or `formatInvoiceNumber` name the domain right after the verb and are fine.
 */
const DOMAINLESS_WORDS: ReadonlySet<string> = new Set([
  "can", "is", "has", "should", "must", "may", "check", "validate", "verify", "ensure", "assert", "allow",
])

const leadingWord = (name: string): string => /^[a-z]+/.exec(name)?.[0] ?? ""

const isTestFile = (filePath: string): boolean => /\.(test|spec)\.ts$/.test(filePath)

const suggestedName = (name: string): string => `<domain>${name.charAt(0).toUpperCase()}${name.slice(1)}`

const checkLogicFile = (context: RuleContext, filePath: string): readonly Finding<Id>[] =>
  exportedFunctions(loadSourceFile(context.morphProject, filePath))
    .filter((fn) => DOMAINLESS_WORDS.has(leadingWord(fn.name)))
    .map((fn) => ({
      ruleId: "logic-missing-prefix",
      message: `logic function ${fn.name}() has no domain prefix`,
      location: { filePath, line: fn.line },
      suggestion: `Start the name with the domain it judges, e.g. ${suggestedName(fn.name)} (userCan*, orderCan*). The prefixes draft the future domain boundaries.`,
    }))

export const logicPrefixRule: Rule<Id> = {
  id: "logic-prefix",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    return context.snapshot.layerFiles.logic
      .filter((filePath) => !isTestFile(filePath))
      .flatMap((filePath) => checkLogicFile(context, filePath))
  },
}
