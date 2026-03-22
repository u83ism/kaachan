import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "route-inline"

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

/**
 * Check 1: Inline route handlers in route.ts files.
 * Finds call expressions like `router.get('/path', (req, res) => { ... })`
 * where the last argument is an inline function.
 */
const checkInlineHandlers = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []

  const callExprs = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)

  for (const call of callExprs) {
    const expr = call.getExpression()
    if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) continue

    const propAccess = expr.asKindOrThrow(SyntaxKind.PropertyAccessExpression)
    if (!HTTP_METHODS.has(propAccess.getName())) continue

    const args = call.getArguments()
    const lastArg = args.at(-1)
    if (lastArg === undefined) continue

    const lastArgKind = lastArg.getKind()
    if (
      lastArgKind !== SyntaxKind.ArrowFunction &&
      lastArgKind !== SyntaxKind.FunctionExpression
    ) {
      continue
    }

    diagnostics.push({
      ruleId: RULE_ID,
      severity: "warning",
      message: `route.ts defines an inline handler for .${propAccess.getName()}() — extract to a Workflow file`,
      location: { filePath, line: call.getStartLineNumber() },
      suggestion:
        "Move the handler body into a dedicated workflow.ts function and pass the function reference here.",
    })
  }

  return diagnostics
}

/**
 * Check 2: Auth/rate-limit library imports in workflow.ts.
 * workflow.ts should not own cross-cutting auth or rate-limit concerns.
 */
const checkWorkflowAuthImports = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Diagnostic[] => {
  const authImports = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter(isAuthPackage)

  if (authImports.length === 0) return []

  return [
    {
      ruleId: RULE_ID,
      severity: "warning",
      message: `workflow.ts imports auth library directly (${authImports.join(", ")}) — move to middleware.ts`,
      location: { filePath },
      suggestion:
        "Handle authentication and rate-limiting in middleware.ts and pass verified data into workflow functions.",
    },
  ]
}

export const routeInlineRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 2,
  check(context: RuleContext): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = []

    for (const fileInfo of context.snapshot.sourceFiles) {
      const filePath = fileInfo.absolutePath

      if (filePath.endsWith("route.ts")) {
        const sf =
          context.morphProject.getSourceFile(filePath) ??
          context.morphProject.addSourceFileAtPath(filePath)
        diagnostics.push(...checkInlineHandlers(sf, filePath))
        continue
      }

      if (filePath.endsWith("workflow.ts")) {
        const sf =
          context.morphProject.getSourceFile(filePath) ??
          context.morphProject.addSourceFileAtPath(filePath)
        diagnostics.push(...checkWorkflowAuthImports(sf, filePath))
      }
    }

    return diagnostics
  },
}
