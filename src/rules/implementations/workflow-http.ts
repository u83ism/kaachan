import { Node, SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import {
  exportedFunctions,
  isRelativeLayerImport,
  loadSourceFile,
  namesImportedFrom,
} from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "workflow-http-access",
  "workflow-calls-parse",
] as const
type Id = (typeof RULE_IDS)[number]

/** HTTP framework packages. Subpath imports (e.g. `hono/cookie`) count too */
const HTTP_PACKAGES: readonly string[] = [
  "express",
  "hono",
  "fastify",
  "koa",
  "@koa/router",
  "next/server",
  "h3",
  "elysia",
]

const isHttpPackage = (specifier: string): boolean =>
  HTTP_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))

/** Type names of HTTP request / response / context objects */
const HTTP_TYPE_PATTERN =
  /\b(Request|Response|Context|NextFunction|IncomingMessage|ServerResponse|FastifyRequest|FastifyReply|NextRequest|NextResponse|H3Event)\b/

// --- Check 1: workflow touches HTTP request, response or context ---

const checkHttpImports = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] =>
  sourceFile
    .getImportDeclarations()
    .filter((d) => isHttpPackage(d.getModuleSpecifierValue()))
    .map((d) => ({
      ruleId: "workflow-http-access",
      message: `workflow.ts imports the HTTP framework "${d.getModuleSpecifierValue()}" — a workflow must not know HTTP`,
      location: { filePath, line: d.getStartLineNumber() },
      suggestion:
        "Let route.ts read the request and set the response; pass the workflow a typed input (and the principal) and return data.",
    }))

const checkHttpParameters = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] =>
  exportedFunctions(sourceFile).flatMap((fn) => {
    const params = fn.node
      .getParameters()
      .filter((p) => HTTP_TYPE_PATTERN.test(p.getTypeNode()?.getText() ?? ""))
    return params.map((p) => ({
      ruleId: "workflow-http-access",
      message: `workflow ${fn.name}() takes "${p.getName()}: ${p.getTypeNode()?.getText() ?? ""}" — a workflow must not touch HTTP request, response or context objects`,
      location: { filePath, line: fn.line },
      suggestion:
        "Take a typed input (and the principal) instead; route.ts runs parse on the request and turns the return value into the response.",
    }))
  })

// --- Check 2: workflow calls a parse function ---

const checkParseCalls = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const parseNames = namesImportedFrom(sourceFile, (s) => isRelativeLayerImport(s, "parse"))
  if (parseNames.size === 0) return []

  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const callee = call.getExpression()
    const root = Node.isPropertyAccessExpression(callee) ? callee.getExpression() : callee
    const name = root.getText()
    if (!Node.isIdentifier(root) || !parseNames.has(name)) return []
    return [
      {
        ruleId: "workflow-calls-parse",
        message: `workflow.ts calls ${callee.getText()}() from parse — parsing belongs in route`,
        location: { filePath, line: call.getStartLineNumber() },
        suggestion:
          "Combine parse and the workflow in route.ts (e.g. json(parseCreateUser, CreateUserWorkflow)) so the workflow receives an already typed input.",
      },
    ]
  })
}

export const workflowHttpRule: Rule<Id> = {
  id: "workflow-http",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    return snapshot.layerFiles.workflow.flatMap((filePath) => {
      const sourceFile = loadSourceFile(morphProject, filePath)
      return [
        ...checkHttpImports(sourceFile, filePath),
        ...checkHttpParameters(sourceFile, filePath),
        ...checkParseCalls(sourceFile, filePath),
      ]
    })
  },
}
