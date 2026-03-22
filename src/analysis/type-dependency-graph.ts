import { SyntaxKind, type Node, type SourceFile } from "ts-morph"

export interface FunctionTypeEntry {
  readonly name: string
  readonly types: readonly string[]
}

export interface TypeGroup {
  readonly functions: readonly string[]
  readonly types: readonly string[]
}

export interface TypeDependencyResult {
  readonly hasNonIntersecting: boolean
  readonly groups: readonly TypeGroup[]
}

const BUILTIN_TYPES = new Set<string>([
  "string",
  "number",
  "boolean",
  "null",
  "undefined",
  "void",
  "never",
  "unknown",
  "any",
  "object",
  "symbol",
  "bigint",
  "Promise",
  "Array",
  "ReadonlyArray",
  "Readonly",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "Exclude",
  "Extract",
  "NonNullable",
  "Record",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Error",
  "Date",
  "RegExp",
  "ReturnType",
  "Parameters",
  "InstanceType",
])

const collectTypeNames = (node: Node): readonly string[] =>
  node
    .getDescendantsOfKind(SyntaxKind.TypeReference)
    .map((ref) => ref.getTypeName().getText())
    .filter((name) => !BUILTIN_TYPES.has(name))

const getExportedFunctionEntries = (sourceFile: SourceFile): readonly FunctionTypeEntry[] => {
  const entries: FunctionTypeEntry[] = []

  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported()) {
      const name = fn.getName()
      if (name !== undefined) {
        entries.push({ name, types: collectTypeNames(fn) })
      }
    }
  }

  for (const decl of sourceFile.getVariableDeclarations()) {
    const varStatement = decl.getVariableStatement()
    if (varStatement?.isExported() !== true) continue
    const initializer = decl.getInitializer()
    if (initializer === undefined) continue
    const kind = initializer.getKind()
    if (kind !== SyntaxKind.ArrowFunction && kind !== SyntaxKind.FunctionExpression) continue
    entries.push({ name: decl.getName(), types: collectTypeNames(initializer) })
  }

  return entries
}

export const findConnectedComponents = (
  entries: readonly FunctionTypeEntry[],
): readonly TypeGroup[] => {
  if (entries.length === 0) return []

  const parent = new Map<string, string>(entries.map((e) => [e.name, e.name]))

  const findRoot = (x: string): string => {
    let current = x
    for (;;) {
      const p = parent.get(current)
      if (p === undefined || p === current) return current
      current = p
    }
  }

  const union = (a: string, b: string): void => {
    const rootA = findRoot(a)
    const rootB = findRoot(b)
    if (rootA !== rootB) parent.set(rootA, rootB)
  }

  const typeToFunctions = new Map<string, string[]>()
  for (const entry of entries) {
    for (const type of entry.types) {
      const existing = typeToFunctions.get(type) ?? []
      typeToFunctions.set(type, [...existing, entry.name])
    }
  }

  for (const fns of typeToFunctions.values()) {
    const [first, ...rest] = fns
    if (first === undefined) continue
    for (const other of rest) {
      union(first, other)
    }
  }

  const components = new Map<string, string[]>()
  for (const entry of entries) {
    const root = findRoot(entry.name)
    const group = components.get(root) ?? []
    components.set(root, [...group, entry.name])
  }

  const entryByName = new Map(entries.map((e) => [e.name, e]))

  return [...components.values()].map((fns) => ({
    functions: fns,
    types: [...new Set(fns.flatMap((fn) => entryByName.get(fn)?.types ?? []))],
  }))
}

export const buildTypeDependencyGraph = (sourceFile: SourceFile): TypeDependencyResult => {
  const entries = getExportedFunctionEntries(sourceFile)
  const groups = findConnectedComponents(entries)
  return {
    hasNonIntersecting: groups.length >= 2,
    groups,
  }
}
