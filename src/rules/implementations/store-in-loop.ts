import { Node, SyntaxKind } from "ts-morph"
import type { CallExpression, SourceFile } from "ts-morph"
import { isRelativeLayerImport, loadSourceFile, namesImportedFrom } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "store-call-in-loop",
] as const
type Id = (typeof RULE_IDS)[number]

/** Array methods whose callback runs once per element */
const ITERATION_METHODS: ReadonlySet<string> = new Set([
  "forEach", "map", "flatMap", "filter", "reduce", "some", "every", "find", "findIndex",
])

/** The body of a loop statement (not its iterated expression: `for (const u of await listUsers())` runs once) */
const isLoopBody = (node: Node): boolean => {
  const loop = node.getParent()
  return (
    (Node.isForStatement(loop) ||
      Node.isForOfStatement(loop) ||
      Node.isForInStatement(loop) ||
      Node.isWhileStatement(loop) ||
      Node.isDoStatement(loop)) &&
    loop.getStatement() === node
  )
}

/** A function passed as an argument to `xs.map(...)`, `xs.forEach(...)`, etc. */
const isIterationCallback = (node: Node): boolean => {
  if (!Node.isArrowFunction(node) && !Node.isFunctionExpression(node)) return false
  const call = node.getParent()
  if (!Node.isCallExpression(call)) return false
  const callee = call.getExpression()
  return Node.isPropertyAccessExpression(callee) && ITERATION_METHODS.has(callee.getName())
}

const isInLoop = (call: CallExpression): boolean =>
  call.getAncestors().some((a) => isLoopBody(a) || isIterationCallback(a))

/** `findUserById(...)` or `store.findUserById(...)` on a name imported from a store module */
const calledStoreName = (call: CallExpression, storeNames: ReadonlySet<string>): string | undefined => {
  const callee = call.getExpression()
  const root = Node.isPropertyAccessExpression(callee) ? callee.getExpression() : callee
  return Node.isIdentifier(root) && storeNames.has(root.getText()) ? callee.getText() : undefined
}

const checkFile = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const storeNames = namesImportedFrom(sourceFile, (s) => isRelativeLayerImport(s, "store"))
  if (storeNames.size === 0) return []

  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const name = calledStoreName(call, storeNames)
    if (name === undefined || !isInLoop(call)) return []
    return [
      {
        ruleId: "store-call-in-loop",
        message: `${name}() is called inside a loop — this can cause N+1 queries`,
        location: { filePath, line: call.getStartLineNumber() },
        suggestion:
          "Fetch everything at once with a batch store function (e.g. findUsersByIds(ids) returning a Map) and match the results in memory.",
      },
    ]
  })
}

export const storeInLoopRule: Rule<Id> = {
  id: "store-in-loop",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    return snapshot.layerFiles.workflow.flatMap((filePath) =>
      checkFile(loadSourceFile(morphProject, filePath), filePath),
    )
  },
}
