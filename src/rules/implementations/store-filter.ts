import { Node, SyntaxKind } from "ts-morph"
import type { SourceFile, TypeNode } from "ts-morph"
import { exportedFunctions, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "store-generic-filter",
] as const
type Id = (typeof RULE_IDS)[number]

/** Property names that hold a column name, an operator or a sort key in filter / search query types */
const VOCABULARY_PROPERTIES: ReadonlySet<string> = new Set([
  "field", "fields", "column", "columns", "op", "operator", "orderBy", "sortBy", "sortField", "sortKey",
])

/** Store read functions, whose parameters are filters or search queries */
const READ_PREFIXES: readonly string[] = ["find", "list", "get", "count", "search"]

const SUGGESTION =
  "Type column names, operators and sort keys as unions of literals the store defines (e.g. \"status\" | \"joinedAt\"), and validate external conditions in parse."

/** `string`, `string[]`, or a union with one of them as a member */
const isOpenString = (typeNode: TypeNode | undefined): boolean => {
  if (typeNode === undefined) return false
  if (typeNode.getKind() === SyntaxKind.StringKeyword) return true
  if (Node.isArrayTypeNode(typeNode)) return isOpenString(typeNode.getElementTypeNode())
  if (Node.isUnionTypeNode(typeNode)) return typeNode.getTypeNodes().some(isOpenString)
  return false
}

/** `Record<string, ...>` or a type literal with a `[key: string]` index signature */
const hasOpenKeys = (typeNode: TypeNode | undefined): boolean => {
  if (Node.isTypeReference(typeNode)) {
    const [keyType] = typeNode.getTypeArguments()
    return typeNode.getTypeName().getText() === "Record" && isOpenString(keyType)
  }
  return (
    Node.isTypeLiteral(typeNode) &&
    typeNode.getIndexSignatures().some((s) => s.getKeyTypeNode().getKind() === SyntaxKind.StringKeyword)
  )
}

const checkVocabularyProperties = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.PropertySignature)
    .filter((p) => VOCABULARY_PROPERTIES.has(p.getName()) && isOpenString(p.getTypeNode()))
    .map((p) => ({
      ruleId: "store-generic-filter",
      message: `store.ts: "${p.getName()}: ${p.getTypeNode()?.getText() ?? ""}" is open — any column or operator can be passed`,
      location: { filePath, line: p.getStartLineNumber() },
      suggestion: SUGGESTION,
    }))

const checkOpenKeyParameters = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] =>
  exportedFunctions(sourceFile)
    .filter((fn) => READ_PREFIXES.some((prefix) => fn.name.startsWith(prefix)))
    .flatMap((fn) =>
      fn.node
        .getParameters()
        .filter((p) => hasOpenKeys(p.getTypeNode()))
        .map((p) => ({
          ruleId: "store-generic-filter" as const,
          message: `store.ts: ${fn.name}() takes "${p.getName()}: ${p.getTypeNode()?.getText() ?? ""}" — column names are open`,
          location: { filePath, line: fn.line },
          suggestion: SUGGESTION,
        })),
    )

export const storeFilterRule: Rule<Id> = {
  id: "store-filter",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { morphProject, snapshot } = context
    return snapshot.layerFiles.store.flatMap((filePath) => {
      const sourceFile = loadSourceFile(morphProject, filePath)
      return [
        ...checkVocabularyProperties(sourceFile, filePath),
        ...checkOpenKeyParameters(sourceFile, filePath),
      ]
    })
  },
}
