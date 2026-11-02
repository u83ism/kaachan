import { basename, join } from "node:path"
import { Node, SyntaxKind, VariableDeclarationKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { FOLDER_NAMES } from "@u83ism/architecture-rules"
import { isInsideDir, isOrmImport, isRelativeLayerImport, loadSourceFile } from "../../analysis/layer-modules.js"
import { measureFile } from "../../analysis/line-counter.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "shared-side-effects",
  "shared-size",
] as const
type Id = (typeof RULE_IDS)[number]

/** shared/ files that must hold pure functions only (shared/store.ts may access the database) */
const PURE_SHARED_FILES: readonly string[] = ["utility.ts", "smallLogic.ts"]

/** Node built-ins and HTTP clients that do I/O. `node:` prefixed and subpath imports count too */
const IO_PACKAGES: readonly string[] = [
  "fs", "child_process", "http", "https", "http2", "net", "dgram", "tls", "dns", "worker_threads", "cluster",
  "axios", "node-fetch", "got", "ky", "undici",
]

/** Calls whose effect is I/O or scheduling: `fetch(...)`, `console.log(...)`, `setTimeout(...)`, `process.exit(...)` */
const SIDE_EFFECT_CALLEES: readonly string[] = ["fetch", "console", "setTimeout", "setInterval", "setImmediate", "process"]

const isIoImport = (specifier: string): boolean => {
  const name = specifier.replace(/^node:/, "")
  return (
    IO_PACKAGES.some((pkg) => name === pkg || name.startsWith(`${pkg}/`)) ||
    isOrmImport(specifier) ||
    ["store", "client"].some((layer) => isRelativeLayerImport(specifier, layer))
  )
}

/** The leftmost identifier of a callee: `console` for `console.log`, `fetch` for `fetch` */
const calleeRoot = (node: Node): string => {
  const expr = Node.isPropertyAccessExpression(node) ? node.getExpression() : node
  return Node.isPropertyAccessExpression(expr) ? calleeRoot(expr) : expr.getText()
}

const checkSideEffects = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const name = basename(filePath)
  const finding = (line: number, what: string): Finding<Id> => ({
    ruleId: "shared-side-effects",
    message: `shared/${name} ${what} — it must hold pure functions only`,
    location: { filePath, line },
    suggestion:
      "Keep I/O, logging and module state out of shared/utility.ts and shared/smallLogic.ts: take the data as arguments and let a workflow (or shared/store.ts for the database) do the I/O.",
  })

  const imports = sourceFile
    .getImportDeclarations()
    .filter((d) => !d.isTypeOnly() && isIoImport(d.getModuleSpecifierValue()))
    .map((d) => finding(d.getStartLineNumber(), `imports "${d.getModuleSpecifierValue()}"`))

  const calls = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter((call) => SIDE_EFFECT_CALLEES.includes(calleeRoot(call.getExpression())))
    .map((call) => finding(call.getStartLineNumber(), `calls ${call.getExpression().getText()}()`))

  const moduleState = sourceFile
    .getVariableStatements()
    .filter((stmt) => stmt.getDeclarationKind() !== VariableDeclarationKind.Const)
    .map((stmt) => finding(stmt.getStartLineNumber(), `keeps module-level mutable state (${stmt.getDeclarationKind()})`))

  return [...imports, ...calls, ...moduleState]
}

const checkSize = (context: RuleContext, filePath: string, relativePath: string): readonly Finding<Id>[] => {
  const { warningLines } = context.config.thresholds
  const metrics = measureFile(context.morphProject, filePath)
  if (!metrics.ok || metrics.value.lineCount <= warningLines) return []
  return [
    {
      ruleId: "shared-size",
      message: `${relativePath} is too large (${metrics.value.lineCount} lines) — shared/ is a temporary home`,
      location: { filePath },
      suggestion:
        "Move what belongs to one domain into that domain, and give a growing group of related code its own domain.",
    },
  ]
}

export const sharedLayerRule: Rule<Id> = {
  id: "shared-layer",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    if (!snapshot.hasSharedFolder) return []

    const sharedDir = join(snapshot.sourceRoot, FOLDER_NAMES.SHARED)
    const sharedFiles = snapshot.sourceFiles.filter((f) => isInsideDir(f.absolutePath, sharedDir))
    const pureFiles = PURE_SHARED_FILES.map((f) => join(sharedDir, f)).filter((p) =>
      sharedFiles.some((f) => f.absolutePath === p),
    )

    return [
      ...pureFiles.flatMap((p) => checkSideEffects(loadSourceFile(morphProject, p), p)),
      ...sharedFiles.flatMap((f) => checkSize(context, f.absolutePath, f.relativePath)),
    ]
  },
}
