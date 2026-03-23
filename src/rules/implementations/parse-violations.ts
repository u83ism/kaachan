import { join } from "node:path"
import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "parse-violations"

const ORM_PACKAGES = [
  "@prisma/client",
  "drizzle-orm",
  "typeorm",
  "@mikro-orm/core",
  "sequelize",
  "knex",
  "mongoose",
] as const

const isOrmImport = (specifier: string): boolean =>
  (ORM_PACKAGES as readonly string[]).includes(specifier)

const isRepositoryImport = (specifier: string): boolean => {
  const normalized = specifier.replace(/\.(js|ts)$/, "")
  return normalized.split("/").at(-1) === "repository"
}

const checkParseDbAccess = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Diagnostic[] => {
  const violations = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter((spec) => isOrmImport(spec) || isRepositoryImport(spec))

  return violations.map((spec) => ({
    ruleId: RULE_ID,
    severity: "error" as const,
    message: `parse.ts imports "${spec}" — Parse layer must not access the database`,
    location: { filePath },
    suggestion:
      "Move DB calls to repository.ts and pass the resolved data into parse functions as arguments.",
  }))
}

// Heuristic: workflow.ts calls JSON.parse() directly, which signals inline input parsing.
// Conservative — only flags explicit JSON.parse usage to avoid false positives.
const checkWorkflowInlineParse = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Diagnostic[] => {
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
      ruleId: RULE_ID,
      severity: "warning" as const,
      message: `workflow.ts calls JSON.parse() directly — extract input parsing to parse.ts`,
      location: { filePath, line: jsonParseCalls[0]?.getStartLineNumber() },
      suggestion:
        'Create a typed parse function in parse.ts and call it from workflow.ts instead of using JSON.parse() inline.',
    },
  ]
}

export const parseViolationsRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 3,
  check(context: RuleContext): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = []

    if (context.snapshot.hasParse && !context.snapshot.hasParseFolder) {
      const parseFilePath = join(context.snapshot.sourceRoot, "parse.ts")
      const parseFile =
        context.morphProject.getSourceFile(parseFilePath) ??
        context.morphProject.addSourceFileAtPath(parseFilePath)
      diagnostics.push(...checkParseDbAccess(parseFile, parseFilePath))
    }

    if (context.snapshot.hasWorkflow) {
      const workflowFilePath = join(context.snapshot.sourceRoot, "workflow.ts")
      const workflowFile =
        context.morphProject.getSourceFile(workflowFilePath) ??
        context.morphProject.addSourceFileAtPath(workflowFilePath)
      diagnostics.push(...checkWorkflowInlineParse(workflowFile, workflowFilePath))
    }

    return diagnostics
  },
}
