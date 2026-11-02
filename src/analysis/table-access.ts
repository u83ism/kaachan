import { Node, SyntaxKind } from "ts-morph"
import type { CallExpression, SourceFile } from "ts-morph"
import { importedNames } from "./layer-modules.js"

export type TableAccessKind = "read" | "write"

export interface TableAccess {
  /** The ORM model name as it appears in code, e.g. `userProfile` for `prisma.userProfile.findMany()` */
  readonly table: string
  readonly kind: TableAccessKind
  readonly line: number
}

/** Prisma-style model methods: `prisma.user.findMany()`, `tx.order.create()`, `db.query.users.findMany()` */
const MODEL_METHODS: ReadonlyMap<string, TableAccessKind> = new Map([
  ...["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy"].map(
    (m): [string, TableAccessKind] => [m, "read"],
  ),
  ...["create", "createMany", "createManyAndReturn", "update", "updateMany", "upsert", "delete", "deleteMany"].map(
    (m): [string, TableAccessKind] => [m, "write"],
  ),
])

/** Drizzle-style builder calls that take the table: `db.insert(users)`, `db.select().from(users)` */
const BUILDER_METHODS: ReadonlyMap<string, TableAccessKind> = new Map([
  ["from", "read"],
  ["insert", "write"],
  ["update", "write"],
  ["delete", "write"],
])

/** `<client>.<model>.<method>(...)`: the model is the segment before a known method */
const modelAccess = (call: CallExpression): Omit<TableAccess, "line"> | undefined => {
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return undefined
  const kind = MODEL_METHODS.get(callee.getName())
  const model = callee.getExpression()
  if (kind === undefined || !Node.isPropertyAccessExpression(model)) return undefined
  return { table: model.getName(), kind }
}

/**
 * `<builder>.<method>(table)`: counted only when the argument is an imported name (a schema table),
 * so that `cache.delete(key)` is not taken for a table access.
 */
const builderAccess = (call: CallExpression, imported: ReadonlySet<string>): Omit<TableAccess, "line"> | undefined => {
  const callee = call.getExpression()
  if (!Node.isPropertyAccessExpression(callee)) return undefined
  const kind = BUILDER_METHODS.get(callee.getName())
  const [arg] = call.getArguments()
  if (kind === undefined || !Node.isIdentifier(arg) || !imported.has(arg.getText())) return undefined
  return { table: arg.getText(), kind }
}

/** Table reads and writes in a store or adapter file, in source order */
export const findTableAccesses = (sourceFile: SourceFile): readonly TableAccess[] => {
  const imported = new Set(sourceFile.getImportDeclarations().flatMap(importedNames))
  return sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).flatMap((call) => {
    const access = modelAccess(call) ?? builderAccess(call, imported)
    return access === undefined ? [] : [{ ...access, line: call.getStartLineNumber() }]
  })
}
