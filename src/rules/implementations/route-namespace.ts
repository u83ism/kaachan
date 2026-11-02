import { Node, SyntaxKind } from "ts-morph"
import type { CallExpression, SourceFile } from "ts-morph"
import { loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "route-api-namespace",
] as const
type Id = (typeof RULE_IDS)[number]

const HTTP_METHODS = new Set(["get", "post", "put", "delete", "patch", "all"])

const API_PREFIX = "/api"

/** Infrastructure routes that belong outside the `/api` group (health checks, webhooks, metrics) */
const INFRASTRUCTURE_PATHS: readonly string[] = [
  "/health", "/healthz", "/ready", "/readyz", "/live", "/livez", "/ping", "/metrics", "/webhooks",
]

const isApiPath = (path: string): boolean => path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)

const isInfrastructurePath = (path: string): boolean =>
  INFRASTRUCTURE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))

const stringValue = (node: Node | undefined): string | undefined =>
  Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node) ? node.getLiteralValue() : undefined

/** The path of a route definition call such as `r.get('/users', ...)`, or undefined for other calls */
const routePath = (call: CallExpression): string | undefined => {
  const expr = call.getExpression()
  if (!Node.isPropertyAccessExpression(expr) || !HTTP_METHODS.has(expr.getName())) return undefined
  if (call.getArguments().length < 2) return undefined
  const path = stringValue(call.getArguments()[0])
  return path?.startsWith("/") === true ? path : undefined
}

/** Whether a call opens an `/api` group: `group({ prefix: '/api' }, ...)`, `route('/api', ...)`, `basePath('/api')` */
const opensApiGroup = (call: CallExpression): boolean =>
  call.getArguments().some((arg) => {
    const literal = stringValue(arg)
    if (literal !== undefined) return isApiPath(literal)
    if (!Node.isObjectLiteralExpression(arg)) return false
    const prefix = arg.getProperty("prefix")
    return Node.isPropertyAssignment(prefix) && isApiPath(stringValue(prefix.getInitializer()) ?? "")
  })

/** Inside the callback of an `/api` group, or called on a router chained from `basePath('/api')` */
const isInApiGroup = (call: CallExpression): boolean =>
  call.getAncestors().some((a) => Node.isCallExpression(a) && opensApiGroup(a)) ||
  call
    .getExpression()
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some(opensApiGroup)

const checkRouteFile = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] =>
  sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const path = routePath(call)
    if (path === undefined || isApiPath(path) || isInfrastructurePath(path) || isInApiGroup(call)) return []
    return [
      {
        ruleId: "route-api-namespace",
        message: `route.ts defines "${path}" outside an /api group`,
        location: { filePath, line: call.getStartLineNumber() },
        suggestion:
          "Define API routes inside route.group({ prefix: '/api' }, ...) so web routes added later do not collide. Keep infrastructure routes such as /health outside the group.",
      },
    ]
  })

export const routeNamespaceRule: Rule<Id> = {
  id: "route-namespace",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    return snapshot.sourceFiles
      .map((f) => f.absolutePath)
      .filter((p) => p.endsWith("route.ts"))
      .flatMap((filePath) => checkRouteFile(loadSourceFile(morphProject, filePath), filePath))
  },
}
