import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { Project } from "ts-morph"
import { findConnectedComponents, buildTypeDependencyGraph } from "../../src/analysis/type-dependency-graph.js"
import type { FunctionTypeEntry } from "../../src/analysis/type-dependency-graph.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, "../fixtures")

// --- Pure unit tests for findConnectedComponents ---

describe("findConnectedComponents", () => {
  it("returns empty array for empty input", () => {
    const result = findConnectedComponents([])
    expect(result).toHaveLength(0)
  })

  it("returns single group when all functions share a type", () => {
    const entries: readonly FunctionTypeEntry[] = [
      { name: "fnA", types: ["UserProfile"] },
      { name: "fnB", types: ["UserProfile"] },
      { name: "fnC", types: ["UserProfile"] },
    ]
    const result = findConnectedComponents(entries)
    expect(result).toHaveLength(1)
    expect(result[0]?.functions.sort()).toEqual(["fnA", "fnB", "fnC"])
  })

  it("returns two groups when functions have no shared types", () => {
    const entries: readonly FunctionTypeEntry[] = [
      { name: "getUserProfile", types: ["UserProfile"] },
      { name: "updateUserProfile", types: ["UserProfile"] },
      { name: "getOrderTotal", types: ["OrderSummary"] },
      { name: "cancelOrder", types: ["OrderSummary"] },
    ]
    const result = findConnectedComponents(entries)
    expect(result).toHaveLength(2)
    const allFunctions = result.flatMap((g) => g.functions).sort()
    expect(allFunctions).toEqual(["cancelOrder", "getOrderTotal", "updateUserProfile", "getUserProfile"].sort())
  })

  it("connects functions transitively through shared types", () => {
    const entries: readonly FunctionTypeEntry[] = [
      { name: "fnA", types: ["TypeX"] },
      { name: "fnB", types: ["TypeX", "TypeY"] },
      { name: "fnC", types: ["TypeY"] },
    ]
    const result = findConnectedComponents(entries)
    expect(result).toHaveLength(1)
    expect(result[0]?.functions.sort()).toEqual(["fnA", "fnB", "fnC"])
  })

  it("returns one group per isolated function when no types", () => {
    const entries: readonly FunctionTypeEntry[] = [
      { name: "fnA", types: [] },
      { name: "fnB", types: [] },
    ]
    const result = findConnectedComponents(entries)
    // Each function is its own component when they share no types
    expect(result).toHaveLength(2)
  })

  it("handles three disconnected groups", () => {
    const entries: readonly FunctionTypeEntry[] = [
      { name: "fnA", types: ["TypeA"] },
      { name: "fnB", types: ["TypeB"] },
      { name: "fnC", types: ["TypeC"] },
    ]
    const result = findConnectedComponents(entries)
    expect(result).toHaveLength(3)
  })

  it("includes all types in group result", () => {
    const entries: readonly FunctionTypeEntry[] = [
      { name: "fnA", types: ["TypeX", "TypeZ"] },
      { name: "fnB", types: ["TypeX"] },
    ]
    const result = findConnectedComponents(entries)
    expect(result).toHaveLength(1)
    expect(result[0]?.types.sort()).toEqual(["TypeX", "TypeZ"])
  })
})

// --- Integration tests with ts-morph ---

describe("buildTypeDependencyGraph", () => {
  const makeSourceFile = (code: string) => {
    const project = new Project({ useInMemoryFileSystem: true })
    return project.createSourceFile("logic.ts", code)
  }

  it("returns hasNonIntersecting: false for single-domain file", () => {
    const sourceFile = makeSourceFile(`
      interface UserProfile { name: string }
      export const getUser = (p: UserProfile): UserProfile => p
      export const updateUser = (p: UserProfile): UserProfile => p
    `)
    const result = buildTypeDependencyGraph(sourceFile)
    expect(result.hasNonIntersecting).toBe(false)
    expect(result.groups).toHaveLength(1)
  })

  it("returns hasNonIntersecting: true for two-domain file", () => {
    const sourceFile = makeSourceFile(`
      interface UserProfile { name: string }
      interface OrderSummary { total: number }
      export const getUser = (p: UserProfile): UserProfile => p
      export const getOrder = (o: OrderSummary): OrderSummary => o
    `)
    const result = buildTypeDependencyGraph(sourceFile)
    expect(result.hasNonIntersecting).toBe(true)
    expect(result.groups).toHaveLength(2)
  })

  it("returns hasNonIntersecting: false for empty file", () => {
    const sourceFile = makeSourceFile("export {}")
    const result = buildTypeDependencyGraph(sourceFile)
    expect(result.hasNonIntersecting).toBe(false)
    expect(result.groups).toHaveLength(0)
  })

  it("filters out built-in types (does not falsely connect via string/number)", () => {
    const sourceFile = makeSourceFile(`
      interface UserProfile { name: string }
      interface OrderSummary { total: number }
      export const getUser = (_id: string): UserProfile => ({ name: "" })
      export const getOrder = (_id: string): OrderSummary => ({ total: 0 })
    `)
    const result = buildTypeDependencyGraph(sourceFile)
    // Both functions take string, but string is a builtin — should NOT connect them
    expect(result.hasNonIntersecting).toBe(true)
  })

  it("detects non-intersecting groups in the fixture file", () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true })
    const sourceFile = project.addSourceFileAtPath(join(fixturesDir, "fat-logic/non-intersecting.ts"))
    const result = buildTypeDependencyGraph(sourceFile)
    expect(result.hasNonIntersecting).toBe(true)
    expect(result.groups).toHaveLength(2)
    const allFunctions = result.groups.flatMap((g) => g.functions).sort()
    expect(allFunctions).toEqual(["cancelOrder", "getOrderTotal", "getUserProfile", "updateUserProfile"])
  })

  it("detects non-exported functions are ignored", () => {
    const sourceFile = makeSourceFile(`
      interface UserProfile { name: string }
      interface OrderSummary { total: number }
      export const getUser = (p: UserProfile): UserProfile => p
      const getOrder = (o: OrderSummary): OrderSummary => o
    `)
    const result = buildTypeDependencyGraph(sourceFile)
    // Only exported function — single component
    expect(result.hasNonIntersecting).toBe(false)
    expect(result.groups).toHaveLength(1)
  })
})
