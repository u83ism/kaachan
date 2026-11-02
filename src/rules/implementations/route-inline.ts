import { Node, SyntaxKind } from "ts-morph"
import type { ImportDeclaration, SourceFile } from "ts-morph"
import { isOrmImport, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "route-handler-non-http",
  "workflow-auth-import",
] as const
type Id = (typeof RULE_IDS)[number]

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch"])

/**
 * Known auth and rate-limiting packages that should live in middleware.ts,
 * not in workflow.ts.
 */
const AUTH_PACKAGES: readonly string[] = [
  "jsonwebtoken",
  "jose",
  "passport",
  "passport-local",
  "passport-jwt",
  "@auth/core",
  "next-auth",
  "express-jwt",
  "express-rate-limit",
  "rate-limiter-flexible",
  "@fastify/jwt",
]

const isAuthPackage = (specifier: string): boolean =>
  AUTH_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(pkg + "/"))

/** Layer modules a route handler must not call directly (only parse and workflow) */
const NON_HTTP_LAYER_MODULES: readonly string[] = ["store", "logic"]

const isNonHttpModule = (specifier: string): boolean =>
  isOrmImport(specifier) ||
  (specifier.startsWith(".") &&
    specifier.replace(/\.(js|ts)$/, "").split("/").some((s) => NON_HTTP_LAYER_MODULES.includes(s)))

const importedNames = (decl: ImportDeclaration): readonly string[] => [
  ...decl.getNamedImports().map((n) => n.getAliasNode()?.getText() ?? n.getName()),
  ...[decl.getDefaultImport(), decl.getNamespaceImport()].flatMap((n) => (n ? [n.getText()] : [])),
]

/** Identifier uses, excluding property names (`res.json` does not use a variable named `json`) */
const usedIdentifiers = (node: Node): readonly string[] =>
  node
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((id) => {
      const parent = id.getParent()
      return !(Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id)
    })
    .map((id) => id.getText())

/**
 * Names in route.ts that reach store, logic or the database: names imported from those
 * modules, plus top-level variables initialized from them (`const prisma = new PrismaClient()`).
 */
const nonHttpNames = (sourceFile: SourceFile): ReadonlySet<string> => {
  const imported = new Set(
    sourceFile
      .getImportDeclarations()
      .filter((d) => isNonHttpModule(d.getModuleSpecifierValue()))
      .flatMap(importedNames),
  )
  const derived = sourceFile
    .getVariableDeclarations()
    .filter((v) => {
      const init = v.getInitializer()
      return init !== undefined && [init.getText(), ...usedIdentifiers(init)].some((n) => imported.has(n))
    })
    .map((v) => v.getName())
  return new Set([...imported, ...derived])
}

/**
 * Check 1: Inline route handlers in route.ts files.
 * Thin handlers doing HTTP I/O only (reading the context, calling parse and a workflow,
 * setting cookies/headers/status) are allowed. A handler is flagged when it calls
 * store, logic or the database directly.
 */
const checkInlineHandlers = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Finding<Id>[] => {
  const forbidden = nonHttpNames(sourceFile)
  if (forbidden.size === 0) return []

  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const expr = call.getExpression()
    if (!Node.isPropertyAccessExpression(expr) || !HTTP_METHODS.has(expr.getName())) return []

    const handler = call.getArguments().at(-1)
    if (!Node.isArrowFunction(handler) && !Node.isFunctionExpression(handler)) return []

    const calls = [...new Set(usedIdentifiers(handler).filter((n) => forbidden.has(n)))]
    if (calls.length === 0) return []

    return [
      {
        ruleId: "route-handler-non-http",
        message: `route.ts handler for .${expr.getName()}() uses ${calls.join(", ")} — a route handler may only do HTTP I/O`,
        location: { filePath, line: call.getStartLineNumber() },
        suggestion:
          "Move the store/logic/DB work into a workflow function and call it from the handler (or pass it to the route directly).",
      },
    ]
  })
}

/**
 * Check 2: Auth/rate-limit library imports in workflow.ts.
 * workflow.ts should not own cross-cutting auth or rate-limit concerns.
 */
const checkWorkflowAuthImports = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Finding<Id>[] => {
  const authImports = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter(isAuthPackage)

  if (authImports.length === 0) return []

  return [
    {
      ruleId: "workflow-auth-import",
      message: `workflow.ts imports auth library directly (${authImports.join(", ")}) — move to middleware.ts`,
      location: { filePath },
      suggestion:
        "Handle authentication and rate-limiting in middleware.ts and pass verified data into workflow functions.",
    },
  ]
}

export const routeInlineRule: Rule<Id> = {
  id: "route-inline",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    const routeFiles = snapshot.sourceFiles
      .map((f) => f.absolutePath)
      .filter((p) => p.endsWith("route.ts"))

    return [
      ...routeFiles.flatMap((filePath) =>
        checkInlineHandlers(loadSourceFile(morphProject, filePath), filePath),
      ),
      ...snapshot.layerFiles.workflow.flatMap((filePath) =>
        checkWorkflowAuthImports(loadSourceFile(morphProject, filePath), filePath),
      ),
    ]
  },
}
