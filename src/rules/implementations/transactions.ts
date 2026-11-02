import { Node, SyntaxKind } from "ts-morph"
import type { CallExpression, SourceFile } from "ts-morph"
import {
  isExternalServicePackage,
  isInsideDir,
  isRelativeLayerImport,
  loadSourceFile,
  namesImportedFrom,
} from "../../analysis/layer-modules.js"
import type { OrchestrateFolder } from "../../types/analysis.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "orchestrate-without-transaction",
  "defer-suggestion",
] as const
type Id = (typeof RULE_IDS)[number]

const TRANSACTION_FUNCTION = "withTransaction"
const DEFER_FUNCTION = "defer"

/** Name of the called function: `withTransaction` for both `withTransaction(...)` and `slime.withTransaction(...)` */
const calledName = (call: CallExpression): string => {
  const callee = call.getExpression()
  return Node.isPropertyAccessExpression(callee) ? callee.getName() : callee.getText()
}

/** The leftmost identifier of a callee: `mailer` for `mailer.send`, `fetch` for `fetch` */
const calleeRoot = (node: Node): string =>
  Node.isPropertyAccessExpression(node) ? calleeRoot(node.getExpression()) : node.getText()

const transactionCalls = (sourceFile: SourceFile): readonly CallExpression[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((c) => calledName(c) === TRANSACTION_FUNCTION)

// --- Check 1: a coordinator with no withTransaction() ---

const checkCoordinator = (context: RuleContext, coordinator: OrchestrateFolder): readonly Finding<Id>[] => {
  const usesTransaction = context.snapshot.sourceFiles
    .filter((f) => isInsideDir(f.absolutePath, coordinator.absolutePath))
    .some((f) => transactionCalls(loadSourceFile(context.morphProject, f.absolutePath)).length > 0)
  if (usesTransaction) return []
  return [
    {
      ruleId: "orchestrate-without-transaction",
      message: `orchestrate/${coordinator.name}/ has no withTransaction() — from Lv8 coordinators exist for atomic multi-domain updates`,
      location: { filePath: coordinator.absolutePath },
      suggestion:
        "If the steps do not need to roll back together, return a domain event from the first domain and let app/workflow.ts pass it on (defer() for failure-tolerant side effects).",
    },
  ]
}

// --- Check 2: non-DB async work inside withTransaction() (opt-in) ---

/**
 * Names whose calls are non-DB I/O: imports from external service packages
 * (mail, payments, HTTP clients) and from client modules (`client.ts`, `client/adapter.ts`)
 */
const nonDbNames = (sourceFile: SourceFile): ReadonlySet<string> =>
  namesImportedFrom(sourceFile, (s) => isExternalServicePackage(s) || isRelativeLayerImport(s, "client"))

/** Inside a `defer(...)` call nested in the transaction callback */
const isDeferred = (call: CallExpression, transaction: CallExpression): boolean => {
  const ancestors = call.getAncestors()
  return ancestors
    .slice(0, ancestors.indexOf(transaction))
    .some((a) => Node.isCallExpression(a) && calledName(a) === DEFER_FUNCTION)
}

const checkDeferCandidates = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const names = nonDbNames(sourceFile)
  return transactionCalls(sourceFile).flatMap((transaction) =>
    transaction
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((call) => {
        const root = calleeRoot(call.getExpression())
        return (root === "fetch" || names.has(root)) && !isDeferred(call, transaction)
      })
      .map((call) => ({
        ruleId: "defer-suggestion" as const,
        message: `${call.getExpression().getText()}() runs inside withTransaction() — non-DB work holds the transaction open and cannot be rolled back`,
        location: { filePath, line: call.getStartLineNumber() },
        suggestion: "Wrap it in defer(() => ...) so it runs after the commit, outside the DB lock time.",
      })),
  )
}

export const transactionsRule: Rule<Id> = {
  id: "transactions",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { orchestrateFolders, sourceFiles } = context.snapshot
    return [
      ...orchestrateFolders.flatMap((o) => checkCoordinator(context, o)),
      ...sourceFiles.flatMap((f) =>
        checkDeferCandidates(loadSourceFile(context.morphProject, f.absolutePath), f.absolutePath),
      ),
    ]
  },
}
