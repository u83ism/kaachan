import { SyntaxKind, type SourceFile } from "ts-morph"

export interface PrefixCheckResult {
  readonly prefixes: ReadonlyMap<string, readonly string[]>
  readonly hasMixing: boolean
}

const extractPrefix = (name: string): string | undefined => {
  const match = /^([a-z]+)/.exec(name)
  return match?.[1]
}

const getExportedFunctionNames = (sourceFile: SourceFile): readonly string[] => {
  const names: string[] = []

  for (const fn of sourceFile.getFunctions()) {
    if (fn.isExported()) {
      const name = fn.getName()
      if (name !== undefined) names.push(name)
    }
  }

  for (const decl of sourceFile.getVariableDeclarations()) {
    const varStatement = decl.getVariableStatement()
    if (varStatement?.isExported() !== true) continue
    const initializer = decl.getInitializer()
    if (initializer === undefined) continue
    const kind = initializer.getKind()
    if (kind !== SyntaxKind.ArrowFunction && kind !== SyntaxKind.FunctionExpression) continue
    names.push(decl.getName())
  }

  return names
}

export const checkPrefixes = (sourceFile: SourceFile): PrefixCheckResult => {
  const names = getExportedFunctionNames(sourceFile)
  const prefixMap = new Map<string, string[]>()

  for (const name of names) {
    const prefix = extractPrefix(name)
    if (prefix === undefined) continue
    const existing = prefixMap.get(prefix) ?? []
    prefixMap.set(prefix, [...existing, name])
  }

  return {
    prefixes: prefixMap,
    hasMixing: prefixMap.size > 1,
  }
}
