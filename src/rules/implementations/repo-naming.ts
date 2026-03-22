import { join } from "node:path"
import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "repo-naming"

const VALID_PREFIXES = [
  "find", "list", "get", "count", "search",
  "create", "save", "update", "delete", "remove",
] as const

const ORM_PACKAGES = [
  "@prisma/client",
  "drizzle-orm",
  "typeorm",
  "@mikro-orm/core",
  "sequelize",
  "knex",
  "mongoose",
] as const

const hasValidPrefix = (name: string): boolean =>
  VALID_PREFIXES.some((prefix) => name.startsWith(prefix))

const getExportedFunctionNames = (sourceFile: SourceFile): readonly string[] => {
  const fromDeclarations = sourceFile
    .getFunctions()
    .filter((f) => f.isExported())
    .map((f) => f.getName())
    .filter((name): name is string => name !== undefined)

  const fromArrows = sourceFile
    .getVariableDeclarations()
    .filter(
      (v) =>
        v.getVariableStatement()?.isExported() === true &&
        (v.getInitializerIfKind(SyntaxKind.ArrowFunction) !== undefined ||
          v.getInitializerIfKind(SyntaxKind.FunctionExpression) !== undefined),
    )
    .map((v) => v.getName())

  return [...fromDeclarations, ...fromArrows]
}

const checkRepositoryNaming = (context: RuleContext): readonly Diagnostic[] => {
  if (!context.snapshot.hasRepository) return []

  const filePath = join(context.snapshot.sourceRoot, "repository.ts")
  const sourceFile =
    context.morphProject.getSourceFile(filePath) ??
    context.morphProject.addSourceFileAtPath(filePath)

  const violations = getExportedFunctionNames(sourceFile).filter(
    (name) => !hasValidPrefix(name),
  )

  if (violations.length === 0) return []

  return violations.map((name) => ({
    ruleId: RULE_ID,
    severity: "hint" as const,
    message: `repository.ts: "${name}" does not follow naming conventions`,
    location: { filePath },
    details: [
      `Read functions: find*, list*, get*, count*, search*`,
      `Write functions: create*, save*, update*, delete*, remove*`,
    ],
    suggestion: `Rename "${name}" to follow the query/command naming convention.`,
  }))
}

const checkWorkflowOrmImports = (context: RuleContext): readonly Diagnostic[] => {
  if (!context.snapshot.hasWorkflow) return []

  const filePath = join(context.snapshot.sourceRoot, "workflow.ts")
  const sourceFile =
    context.morphProject.getSourceFile(filePath) ??
    context.morphProject.addSourceFileAtPath(filePath)

  const ormImports = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter((spec): spec is string => (ORM_PACKAGES as readonly string[]).includes(spec))

  if (ormImports.length === 0) return []

  return [
    {
      ruleId: RULE_ID,
      severity: "warning" as const,
      message: `workflow.ts imports ORM directly (${ormImports.join(", ")}) — DB access must go through repository.ts`,
      location: { filePath },
      suggestion: "Move DB operations to repository.ts and call them from workflow.ts.",
    },
  ]
}

export const repoNamingRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 4,
  check(context: RuleContext): readonly Diagnostic[] {
    return [
      ...checkRepositoryNaming(context),
      ...checkWorkflowOrmImports(context),
    ]
  },
}
