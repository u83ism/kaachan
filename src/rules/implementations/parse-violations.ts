import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { isOrmImport, lastSegment, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "parse-db-import",
  "workflow-raw-parse",
] as const
type Id = (typeof RULE_IDS)[number]

const isStoreImport = (specifier: string): boolean => lastSegment(specifier) === "store"

const checkParseDbAccess = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Finding<Id>[] => {
  const violations = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter((spec) => isOrmImport(spec) || isStoreImport(spec))

  return violations.map((spec) => ({
    ruleId: "parse-db-import",
    message: `parse.ts imports "${spec}" — Parse layer must not access the database`,
    location: { filePath },
    suggestion:
      "Move DB calls to store.ts and pass the resolved data into parse functions as arguments.",
  }))
}

// Heuristic: workflow.ts calls JSON.parse() directly, which signals inline input parsing.
// Conservative — only flags explicit JSON.parse usage to avoid false positives.
const checkWorkflowInlineParse = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Finding<Id>[] => {
  const jsonParseCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => {
      const expr = call.getExpression()
      return (
        expr.getKind() === SyntaxKind.PropertyAccessExpression &&
        expr.getText() === "JSON.parse"
      )
    })

  if (jsonParseCalls.length === 0) return []

  return [
    {
      ruleId: "workflow-raw-parse",
      message: `workflow.ts calls JSON.parse() directly — extract input parsing to parse.ts`,
      location: { filePath, ...(jsonParseCalls[0] != null ? { line: jsonParseCalls[0].getStartLineNumber() } : {}) },
      suggestion:
        'Create a typed parse function in parse.ts and call it from workflow.ts instead of using JSON.parse() inline.',
    },
  ]
}

export const parseViolationsRule: Rule<Id> = {
  id: "parse-violations",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    const load = (filePath: string): SourceFile => loadSourceFile(morphProject, filePath)

    return [
      ...snapshot.layerFiles.parse.flatMap((filePath) => checkParseDbAccess(load(filePath), filePath)),
      ...snapshot.layerFiles.workflow.flatMap((filePath) =>
        checkWorkflowInlineParse(load(filePath), filePath),
      ),
    ]
  },
}
