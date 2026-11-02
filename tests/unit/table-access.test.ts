import { describe, it, expect } from "vitest"
import { Project } from "ts-morph"
import { findTableAccesses } from "../../src/analysis/table-access.js"

const accesses = (code: string): ReturnType<typeof findTableAccesses> => {
  const project = new Project({ useInMemoryFileSystem: true })
  return findTableAccesses(project.createSourceFile("store.ts", code))
}

describe("findTableAccesses", () => {
  it("reads Prisma-style model calls and tells reads from writes", () => {
    expect(
      accesses(`
        prisma.user.findMany()
        tx.userProfile.upsert({})
        db.query.orders.findFirst()
      `).map(({ table, kind }) => ({ table, kind })),
    ).toEqual([
      { table: "user", kind: "read" },
      { table: "userProfile", kind: "write" },
      { table: "orders", kind: "read" },
    ])
  })

  it("reads Drizzle-style builder calls on imported tables only", () => {
    expect(
      accesses(`
        import { users, orders } from "./schema"
        const cache = new Map()
        db.insert(users).values({})
        db.select().from(orders)
        db.delete(users)
        cache.delete(key)
      `).map(({ table, kind }) => `${kind}:${table}`),
    ).toEqual(["write:users", "read:orders", "write:users"])
  })

  it("ignores calls that are not table accesses", () => {
    expect(accesses(`items.find((x) => x); map.get("a"); list.filter(Boolean).map(String)`)).toEqual([])
  })
})
