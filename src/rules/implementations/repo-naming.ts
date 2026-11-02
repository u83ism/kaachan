import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { isOrmImport, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "store-naming",
  "workflow-orm-import",
] as const
type Id = (typeof RULE_IDS)[number]

const VALID_PREFIXES = [
  "find", "list", "get", "count", "search",
  "create", "save", "update", "delete", "remove",
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

const checkStoreNaming = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const violations = getExportedFunctionNames(sourceFile).filter(
    (name) => !hasValidPrefix(name),
  )

  if (violations.length === 0) return []

  return violations.map((name) => ({
    ruleId: "store-naming",
    message: `store.ts: "${name}" does not follow naming conventions`,
    location: { filePath },
    details: [
      `Read functions: find*, list*, get*, count*, search*`,
      `Write functions: create*, save*, update*, delete*, remove*`,
    ],
    suggestion: `Rename "${name}" to follow the query/command naming convention.`,
  }))
}

const checkWorkflowOrmImports = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const ormImports = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter(isOrmImport)

  if (ormImports.length === 0) return []

  return [
    {
      ruleId: "workflow-orm-import",
      message: `workflow.ts imports ORM directly (${ormImports.join(", ")}) — DB access must go through store.ts`,
      location: { filePath },
      suggestion: "Move DB operations to store.ts and call them from workflow.ts.",
    },
  ]
}

export const repoNamingRule: Rule<Id> = {
  id: "repo-naming",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    return [
      ...snapshot.layerFiles.store.flatMap((filePath) =>
        checkStoreNaming(loadSourceFile(morphProject, filePath), filePath),
      ),
      ...snapshot.layerFiles.workflow.flatMap((filePath) =>
        checkWorkflowOrmImports(loadSourceFile(morphProject, filePath), filePath),
      ),
    ]
  },
}
