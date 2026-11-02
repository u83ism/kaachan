import { existsSync } from "node:fs"
import { join } from "node:path"
import { Node } from "ts-morph"
import type { ObjectLiteralExpression, Project, SourceFile } from "ts-morph"
import type { SlimeConfig } from "../types/analysis.js"
import type { Result } from "../types/index.js"

export const SLIME_CONFIG_FILE = "slime.config.ts"

type StringListRecord = Readonly<Record<string, readonly string[]>>

/**
 * Follow what a config value is written as, down to a literal:
 * parentheses, `satisfies` / `as`, a wrapper call (`defineConfig({...})`)
 * and identifiers of variables in the same file.
 */
const unwrap = (node: Node | undefined, sourceFile: SourceFile): Node | undefined => {
  if (node === undefined) return undefined
  if (Node.isParenthesizedExpression(node) || Node.isSatisfiesExpression(node) || Node.isAsExpression(node)) {
    return unwrap(node.getExpression(), sourceFile)
  }
  if (Node.isCallExpression(node)) return unwrap(node.getArguments()[0], sourceFile)
  if (Node.isIdentifier(node)) {
    return unwrap(sourceFile.getVariableDeclaration(node.getText())?.getInitializer(), sourceFile)
  }
  return node
}

const propertyKey = (prop: Node): string | undefined => {
  if (!Node.isPropertyAssignment(prop) && !Node.isShorthandPropertyAssignment(prop)) return undefined
  const nameNode = prop.getNameNode()
  return Node.isStringLiteral(nameNode) ? nameNode.getLiteralText() : nameNode.getText()
}

const propertyValue = (prop: Node): Node | undefined =>
  Node.isPropertyAssignment(prop)
    ? prop.getInitializer()
    : Node.isShorthandPropertyAssignment(prop)
      ? prop.getNameNode()
      : undefined

const findProperty = (object: ObjectLiteralExpression, key: string): Node | undefined =>
  object.getProperties().find((p) => propertyKey(p) === key)

const readStringList = (node: Node | undefined): readonly string[] | undefined => {
  if (!Node.isArrayLiteralExpression(node)) return undefined
  const values = node
    .getElements()
    .map((e) => (Node.isStringLiteral(e) || Node.isNoSubstitutionTemplateLiteral(e) ? e.getLiteralText() : undefined))
  return values.every((v): v is string => v !== undefined) ? values : undefined
}

/** Read `{ name: ["a", "b"], ... }`; every value must be an array of string literals */
const readStringListRecord = (
  node: Node | undefined,
  label: string,
  sourceFile: SourceFile,
): Result<StringListRecord> => {
  const object = unwrap(node, sourceFile)
  if (!Node.isObjectLiteralExpression(object)) {
    return { ok: false, error: `"${label}" must be an object literal` }
  }

  const entries: [string, readonly string[]][] = []
  for (const prop of object.getProperties()) {
    const key = propertyKey(prop)
    const list = readStringList(unwrap(propertyValue(prop), sourceFile))
    if (key === undefined || list === undefined) {
      return { ok: false, error: `"${label}.${key ?? prop.getText()}" must be an array of string literals` }
    }
    entries.push([key, list])
  }
  return { ok: true, value: Object.fromEntries(entries) }
}

const readOptional = (
  config: ObjectLiteralExpression,
  key: string,
  sourceFile: SourceFile,
): Result<StringListRecord | undefined> => {
  const prop = findProperty(config, key)
  if (prop === undefined) return { ok: true, value: undefined }
  return readStringListRecord(propertyValue(prop), key, sourceFile)
}

/** Read `domains` and `tables` from the default export without executing the file */
export const parseSlimeConfig = (sourceFile: SourceFile, filePath: string): Result<SlimeConfig> => {
  const fail = (error: string): Result<SlimeConfig> => ({ ok: false, error: `${filePath}: ${error}` })

  const exported = sourceFile.getExportAssignment((e) => !e.isExportEquals())?.getExpression()
  const config = unwrap(exported, sourceFile)
  // Reading nothing would make every declared dependency look undeclared, so stop instead
  if (!Node.isObjectLiteralExpression(config)) {
    return fail("the default export must be an object literal (optionally wrapped in a call such as defineConfig)")
  }

  const domains = readOptional(config, "domains", sourceFile)
  if (!domains.ok) return fail(domains.error)
  const tables = readOptional(config, "tables", sourceFile)
  if (!tables.ok) return fail(tables.error)

  return { ok: true, value: { kind: "found", filePath, domains: domains.value, tables: tables.value } }
}

export const readSlimeConfig = (rootDir: string, morphProject: Project): Result<SlimeConfig> => {
  const filePath = join(rootDir, SLIME_CONFIG_FILE)
  if (!existsSync(filePath)) return { ok: true, value: { kind: "missing" } }

  const sourceFile = morphProject.getSourceFile(filePath) ?? morphProject.addSourceFileAtPath(filePath)
  return parseSlimeConfig(sourceFile, filePath)
}
