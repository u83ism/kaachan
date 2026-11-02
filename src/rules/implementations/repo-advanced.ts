import { Node, SyntaxKind } from "ts-morph"
import type { FunctionDeclaration, ParameterDeclaration, SourceFile, VariableDeclaration } from "ts-morph"
import { isOrmImport, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "store-orm-return-type",
  "store-orm-param",
  "workflow-orm-transaction",
] as const
type Id = (typeof RULE_IDS)[number]

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

/** ORM names a type annotation refers to (whole identifiers only: `Prisma` does not match `PrismaUser`) */
const referencedOrmNames = (typeText: string, ormNames: ReadonlySet<string>): readonly string[] => {
  const identifiers = new Set(typeText.match(/[A-Za-z_$][\w$]*/g) ?? [])
  return [...ormNames].filter((name) => identifiers.has(name))
}

const getParameters = (fn: ExportedFn): readonly ParameterDeclaration[] => {
  if (Node.isFunctionDeclaration(fn)) return fn.getParameters()
  const init = fn.getInitializer()
  return Node.isArrowFunction(init) || Node.isFunctionExpression(init) ? init.getParameters() : []
}

// --- Check 1: ORM type leaking through store.ts return types ---

const checkRepoOrmLeak = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const ormNames = getOrmImportedNames(sourceFile)
  if (ormNames.size === 0) return []

  const diagnostics: Finding<Id>[] = []

  for (const fn of getExportedFunctions(sourceFile)) {
    const returnTypeText = getReturnTypeText(fn)
    if (!returnTypeText) continue

    const leakedTypes = referencedOrmNames(returnTypeText, ormNames)
    if (leakedTypes.length === 0) continue

    diagnostics.push({
      ruleId: "store-orm-return-type",
      message: `store.ts exposes ORM type in return annotation (${leakedTypes.join(", ")}) — return a plain domain type instead`,
      location: { filePath, line: fn.getStartLineNumber() },
      suggestion:
        "Map the ORM record to a plain domain object before returning. ORM types must not cross the store boundary.",
    })
  }

  return diagnostics
}

// --- Check 2: ORM types or query builders taken as store.ts parameters ---

const checkStoreOrmParams = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const ormNames = getOrmImportedNames(sourceFile)
  if (ormNames.size === 0) return []

  return getExportedFunctions(sourceFile).flatMap((fn) =>
    getParameters(fn).flatMap((param) => {
      const leaked = referencedOrmNames(param.getTypeNode()?.getText() ?? "", ormNames)
      if (leaked.length === 0) return []
      return [
        {
          ruleId: "store-orm-param" as const,
          message: `store.ts: ${fn.getName() ?? "(anonymous)"}() takes an ORM type as parameter "${param.getName()}" (${leaked.join(", ")}) — callers could build queries outside the store`,
          location: { filePath, line: fn.getStartLineNumber() },
          suggestion:
            "Take a filter type the store defines (e.g. UserFilter with literal unions) and build the ORM query inside the store.",
        },
      ]
    }),
  )
}

// --- Check 3: workflow.ts calling ORM transaction API directly ---

const checkWorkflowTransaction = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const transactionCalls = sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
    .filter((pa) => pa.getName() === "$transaction")

  if (transactionCalls.length === 0) return []

  return [
    {
      ruleId: "workflow-orm-transaction",
      message: `workflow.ts calls ORM transaction API ($transaction) directly — use slime.withTransaction() instead`,
      location: { filePath, ...(transactionCalls[0] != null ? { line: transactionCalls[0].getStartLineNumber() } : {}) },
      suggestion:
        "Replace prisma.$transaction([...]) with slime.withTransaction(async () => { ... }) for framework-managed transactions.",
    },
  ]
}

export const repoAdvancedRule: Rule<Id> = {
  id: "repo-advanced",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    return [
      ...snapshot.layerFiles.store.flatMap((filePath) =>
        checkRepoOrmLeak(loadSourceFile(morphProject, filePath), filePath),
      ),
      ...snapshot.layerFiles.store.flatMap((filePath) =>
        checkStoreOrmParams(loadSourceFile(morphProject, filePath), filePath),
      ),
      ...snapshot.layerFiles.workflow.flatMap((filePath) =>
        checkWorkflowTransaction(loadSourceFile(morphProject, filePath), filePath),
      ),
    ]
  },
}
