import { Node, SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "route-sunset-passed",
] as const
type Id = (typeof RULE_IDS)[number]

const ROUTE_FILE_PATTERN = /routes?\.ts$/

/** YYYY-MM-DD at the start of an ISO date or date-time */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/

/** `sunset: '2026-09-01'` in the options of a route definition, with its date */
const sunsetDates = (sourceFile: SourceFile): readonly { readonly date: string; readonly line: number }[] =>
  sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment).flatMap((prop) => {
    if (prop.getName() !== "sunset") return []
    const init = prop.getInitializer()
    const value = Node.isStringLiteral(init) || Node.isNoSubstitutionTemplateLiteral(init) ? init.getLiteralValue() : ""
    const date = ISO_DATE.exec(value)?.[0]
    return date === undefined ? [] : [{ date, line: prop.getStartLineNumber() }]
  })

const checkRouteFile = (sourceFile: SourceFile, filePath: string, today: string): readonly Finding<Id>[] =>
  sunsetDates(sourceFile)
    .filter((s) => s.date < today)
    .map((s) => ({
      ruleId: "route-sunset-passed",
      message: `a route's sunset date ${s.date} has passed (today is ${today})`,
      location: { filePath, line: s.line },
      suggestion: "Remove the route (and its workflow if nothing else uses it), or move the sunset date if the retirement was postponed.",
    }))

export const routeSunsetRule: Rule<Id> = {
  id: "route-sunset",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    return snapshot.sourceFiles
      .map((f) => f.absolutePath)
      .filter((p) => ROUTE_FILE_PATTERN.test(p))
      .flatMap((filePath) => checkRouteFile(loadSourceFile(morphProject, filePath), filePath, context.today))
  },
}
