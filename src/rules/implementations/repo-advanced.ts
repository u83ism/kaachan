import { join } from "node:path"
import { SyntaxKind } from "ts-morph"
import type { FunctionDeclaration, SourceFile, VariableDeclaration } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "repo-advanced"

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

// Collect type and namespace names imported from ORM packages in this file
const getOrmImportedNames = (sourceFile: SourceFile): ReadonlySet<string> => {
  const names = new Set<string>()

  for (const decl of sourceFile.getImportDeclarations()) {
    if (!isOrmImport(decl.getModuleSpecifierValue())) continue

    for (const named of decl.getNamedImports()) {
      names.add(named.getName())
    }

    const ns = decl.getNamespaceImport()
    if (ns) names.add(ns.getText())

    const def = decl.getDefaultImport()
    if (def) names.add(def.getText())
  }

  return names
}

type ExportedFn = FunctionDeclaration | VariableDeclaration

const getExportedFunctions = (sourceFile: SourceFile): readonly ExportedFn[] => {
  const fromDeclarations = sourceFile
    .getFunctions()
    .filter((f) => f.isExported()) as readonly ExportedFn[]

  const fromArrows = sourceFile
    .getVariableDeclarations()
    .filter(
      (v) =>
        v.getVariableStatement()?.isExported() === true &&
        (v.getInitializerIfKind(SyntaxKind.ArrowFunction) !== undefined ||
          v.getInitializerIfKind(SyntaxKind.FunctionExpression) !== undefined),
    ) as readonly ExportedFn[]

  return [...fromDeclarations, ...fromArrows]
}

const getReturnTypeText = (fn: ExportedFn): string | undefined => {
  // FunctionDeclaration has getReturnTypeNode() directly
  if (fn.getKind() === SyntaxKind.FunctionDeclaration) {
    return (fn as FunctionDeclaration).getReturnTypeNode()?.getText()
  }
  // VariableDeclaration: return type is on the ArrowFunction or FunctionExpression initializer
  const varDecl = fn as VariableDeclaration
  const arrowFn = varDecl.getInitializerIfKind(SyntaxKind.ArrowFunction)
  if (arrowFn) return arrowFn.getReturnTypeNode()?.getText()
  const fnExpr = varDecl.getInitializerIfKind(SyntaxKind.FunctionExpression)
  if (fnExpr) return fnExpr.getReturnTypeNode()?.getText()
  return undefined
}

// --- Check 1: ORM type leaking through repository.ts return types ---

const checkRepoOrmLeak = (context: RuleContext): readonly Diagnostic[] => {
  if (!context.snapshot.hasRepository) return []

  const filePath = join(context.snapshot.sourceRoot, "repository.ts")
  const sourceFile =
    context.morphProject.getSourceFile(filePath) ??
    context.morphProject.addSourceFileAtPath(filePath)

  const ormNames = getOrmImportedNames(sourceFile)
  if (ormNames.size === 0) return []

  const diagnostics: Diagnostic[] = []

  for (const fn of getExportedFunctions(sourceFile)) {
    const returnTypeText = getReturnTypeText(fn)
    if (!returnTypeText) continue

    const leakedTypes = [...ormNames].filter((name) => returnTypeText.includes(name))
    if (leakedTypes.length === 0) continue

    diagnostics.push({
      ruleId: RULE_ID,
      severity: "warning",
      message: `repository.ts exposes ORM type in return annotation (${leakedTypes.join(", ")}) — return a plain domain type instead`,
      location: { filePath, line: fn.getStartLineNumber() },
      suggestion:
        "Map the ORM record to a plain domain object before returning. ORM types must not cross the repository boundary.",
    })
  }

  return diagnostics
}

// --- Check 2: workflow.ts calling ORM transaction API directly ---

const checkWorkflowTransaction = (context: RuleContext): readonly Diagnostic[] => {
  if (!context.snapshot.hasWorkflow) return []

  const filePath = join(context.snapshot.sourceRoot, "workflow.ts")
  const sourceFile =
    context.morphProject.getSourceFile(filePath) ??
    context.morphProject.addSourceFileAtPath(filePath)

  const transactionCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((pa) => pa.getName() === "$transaction")

  if (transactionCalls.length === 0) return []

  return [
    {
      ruleId: RULE_ID,
      severity: "warning",
      message: `workflow.ts calls ORM transaction API ($transaction) directly — use slime.withTransaction() instead`,
      location: { filePath, ...(transactionCalls[0] != null ? { line: transactionCalls[0].getStartLineNumber() } : {}) },
      suggestion:
        "Replace prisma.$transaction([...]) with slime.withTransaction(async () => { ... }) for framework-managed transactions.",
    },
  ]
}

export const repoAdvancedRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 4,
  check(context: RuleContext): readonly Diagnostic[] {
    return [...checkRepoOrmLeak(context), ...checkWorkflowTransaction(context)]
  },
}
