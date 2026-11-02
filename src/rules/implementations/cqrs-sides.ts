import { basename, join } from "node:path"
import { existsSync } from "node:fs"
import { Node, SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { FOLDER_NAMES, LAYER_FILES } from "@u83ism/architecture-rules"
import {
  exportedFunctions,
  importedNames,
  isInsideDir,
  loadSourceFile,
  relativeImports,
} from "../../analysis/layer-modules.js"
import { findTableAccesses } from "../../analysis/table-access.js"
import type { DomainFolder } from "../../types/analysis.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "cqrs-folders-missing",
  "query-imports-write-port",
  "query-writes",
  "command-returns-view-model",
  "query-multiple-per-file",
] as const
type Id = (typeof RULE_IDS)[number]

/** Port methods that change state */
const WRITE_METHOD_PATTERN = /^(create|save|update|delete|remove|insert|upsert)/

/** Read-optimized shapes a command must not return */
const VIEW_MODEL_PATTERN = /(View|ViewModel|ReadModel|Projection)$/

const WRITE_PORT_PATTERN = /WritePort$/

interface CqrsDirs {
  readonly commandDir: string
  readonly queryDir: string
}

const dirsOf = (domain: DomainFolder): CqrsDirs => ({
  commandDir: join(domain.absolutePath, FOLDER_NAMES.COMMAND),
  queryDir: join(domain.absolutePath, FOLDER_NAMES.QUERY),
})

/** Query files: everything in query/ except ports.ts */
const queryFiles = (context: RuleContext, domain: DomainFolder): readonly string[] =>
  context.snapshot.sourceFiles
    .map((f) => f.absolutePath)
    .filter((p) => isInsideDir(p, dirsOf(domain).queryDir) && basename(p) !== LAYER_FILES.PORTS)

// --- Check 1: a domain with a workflow but no command/ and query/ ---

/**
 * Domains that serve requests (they have a workflow.ts) must split into command/ and query/.
 * Upstream domains that only provide logic and ports (domains/auth in the theory) are exempt.
 */
const checkCqrsFolders = (domain: DomainFolder): readonly Finding<Id>[] => {
  const servesRequests = existsSync(join(domain.absolutePath, LAYER_FILES.WORKFLOW))
  if (!servesRequests || (domain.hasCommand && domain.hasQuery)) return []
  return [
    {
      ruleId: "cqrs-folders-missing",
      message: `domains/${domain.name}/ has no command/ and query/ — from Lv10 writes and reads are split`,
      location: { filePath: domain.absolutePath },
      suggestion:
        "Move the state-changing workflow and its WritePort into command/, and each read into its own file under query/ with a ReadPort.",
    },
  ]
}

// --- Check 2: query/ importing the write side ---

const checkQueryImports = (
  context: RuleContext,
  domain: DomainFolder,
  sourceFile: SourceFile,
  filePath: string,
): readonly Finding<Id>[] => {
  const infrastructureDir = join(context.snapshot.sourceRoot, FOLDER_NAMES.INFRASTRUCTURE)
  const writeSide = relativeImports(sourceFile, filePath).filter(
    (i) =>
      isInsideDir(i.resolved, dirsOf(domain).commandDir) ||
      (isInsideDir(i.resolved, infrastructureDir) && /command/i.test(basename(i.resolved))),
  )
  const writePorts = sourceFile
    .getImportDeclarations()
    .filter((d) => importedNames(d).some((n) => WRITE_PORT_PATTERN.test(n)))
  const specifiers = [
    ...new Set([...writeSide.map((i) => i.specifier), ...writePorts.map((d) => d.getModuleSpecifierValue())]),
  ]
  return specifiers.map((specifier) => ({
    ruleId: "query-imports-write-port",
    message: `domains/${domain.name}/query/${basename(filePath)} imports the write side ("${specifier}")`,
    location: { filePath },
    suggestion: "Read through the query side's ReadPort only; the WritePort and command adapters belong to command/.",
  }))
}

// --- Check 3: query/ performing writes ---

const checkQueryWrites = (domain: DomainFolder, sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const tableWrites = findTableAccesses(sourceFile)
    .filter((a) => a.kind === "write")
    .map((a) => ({ line: a.line, what: `writes to table "${a.table}"` }))
  const portWrites = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const callee = call.getExpression()
    return Node.isPropertyAccessExpression(callee) && WRITE_METHOD_PATTERN.test(callee.getName())
      ? [{ line: call.getStartLineNumber(), what: `calls ${callee.getText()}()` }]
      : []
  })
  const writes = [...tableWrites, ...portWrites].filter(
    (w, i, all) => all.findIndex((x) => x.line === w.line) === i,
  )
  return writes.map((w) => ({
    ruleId: "query-writes",
    message: `domains/${domain.name}/query/${basename(filePath)} ${w.what} — the query side has no side effects`,
    location: { filePath, line: w.line },
    suggestion: "Move the state change to a command/ workflow.",
  }))
}

// --- Check 4: several queries in one query/ file ---

const checkQueryCount = (domain: DomainFolder, sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const queries = exportedFunctions(sourceFile)
  if (queries.length <= 1) return []
  return [
    {
      ruleId: "query-multiple-per-file",
      message: `domains/${domain.name}/query/${basename(filePath)} has ${queries.length} queries (${queries.map((q) => q.name).join(", ")}) — one query per file`,
      location: { filePath },
      suggestion: "Give each query its own file named after what it fetches (e.g. userList.ts, userDetail.ts), so it can be deleted together with its screen.",
    },
  ]
}

// --- Check 5: command/ workflow returning a view model ---

/** Return type annotations of a function and, for a port-injected workflow `(port) => async (input) => ...`, of the inner function */
const returnTypeTexts = (node: Node): readonly string[] => {
  if (!Node.isArrowFunction(node) && !Node.isFunctionExpression(node) && !Node.isFunctionDeclaration(node)) return []
  const own = node.getReturnTypeNode()?.getText()
  const body = node.getBody()
  return [...(own === undefined ? [] : [own]), ...(body === undefined ? [] : returnTypeTexts(body))]
}

const checkCommandReturns = (context: RuleContext, domain: DomainFolder): readonly Finding<Id>[] => {
  const filePath = join(dirsOf(domain).commandDir, LAYER_FILES.WORKFLOW)
  if (!existsSync(filePath)) return []
  return exportedFunctions(loadSourceFile(context.morphProject, filePath)).flatMap((fn) => {
    const identifiers = returnTypeTexts(fn.node).flatMap((t) => t.match(/[A-Za-z_$][\w$]*/g) ?? [])
    const views = [...new Set(identifiers.filter((n) => VIEW_MODEL_PATTERN.test(n)))]
    return views.length === 0
      ? []
      : [
          {
            ruleId: "command-returns-view-model" as const,
            message: `domains/${domain.name}/command/workflow.ts: ${fn.name}() returns ${views.join(", ")} — building views is the query side's job`,
            location: { filePath, line: fn.line },
            suggestion: "Return the domain event (or the written entity's ID) and let the client fetch the view through a query.",
          },
        ]
  })
}

const checkDomain = (context: RuleContext, domain: DomainFolder): readonly Finding<Id>[] => [
  ...checkCqrsFolders(domain),
  ...queryFiles(context, domain).flatMap((filePath) => {
    const sourceFile = loadSourceFile(context.morphProject, filePath)
    return [
      ...checkQueryImports(context, domain, sourceFile, filePath),
      ...checkQueryWrites(domain, sourceFile, filePath),
      ...checkQueryCount(domain, sourceFile, filePath),
    ]
  }),
  ...checkCommandReturns(context, domain),
]

export const cqrsSidesRule: Rule<Id> = {
  id: "cqrs-sides",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    return context.snapshot.domainFolders.flatMap((d) => checkDomain(context, d))
  },
}
