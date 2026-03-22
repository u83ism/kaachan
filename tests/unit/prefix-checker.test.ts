import { describe, it, expect } from "vitest"
import { Project } from "ts-morph"
import { checkPrefixes } from "../../src/analysis/prefix-checker.js"

const makeSourceFile = (code: string) => {
  const project = new Project({ useInMemoryFileSystem: true })
  return project.createSourceFile("logic.ts", code)
}

describe("checkPrefixes", () => {
  it("returns hasMixing: false for single-prefix file", () => {
    const sourceFile = makeSourceFile(`
      export const userCanCreate = () => {}
      export const userCanUpdate = () => {}
      export const userCanDelete = () => {}
    `)
    const result = checkPrefixes(sourceFile)
    expect(result.hasMixing).toBe(false)
    expect(result.prefixes.size).toBe(1)
    expect(result.prefixes.get("user")).toHaveLength(3)
  })

  it("returns hasMixing: true for mixed-prefix file", () => {
    const sourceFile = makeSourceFile(`
      export const userCanCreate = () => {}
      export const orderCanPlace = () => {}
    `)
    const result = checkPrefixes(sourceFile)
    expect(result.hasMixing).toBe(true)
    expect(result.prefixes.size).toBe(2)
  })

  it("groups functions by prefix correctly", () => {
    const sourceFile = makeSourceFile(`
      export const userCanCreate = () => {}
      export const userCanUpdate = () => {}
      export const orderCanPlace = () => {}
      export const orderCanShip = () => {}
    `)
    const result = checkPrefixes(sourceFile)
    expect(result.prefixes.get("user")).toEqual(["userCanCreate", "userCanUpdate"])
    expect(result.prefixes.get("order")).toEqual(["orderCanPlace", "orderCanShip"])
  })

  it("detects exported function declarations (not just arrow functions)", () => {
    const sourceFile = makeSourceFile(`
      export function userCanCreate() {}
      export function orderCanPlace() {}
    `)
    const result = checkPrefixes(sourceFile)
    expect(result.hasMixing).toBe(true)
  })

  it("ignores non-exported functions", () => {
    const sourceFile = makeSourceFile(`
      export const userCanCreate = () => {}
      const orderInternal = () => {}
    `)
    const result = checkPrefixes(sourceFile)
    expect(result.hasMixing).toBe(false)
  })

  it("returns empty prefixes for empty file", () => {
    const sourceFile = makeSourceFile("")
    const result = checkPrefixes(sourceFile)
    expect(result.prefixes.size).toBe(0)
    expect(result.hasMixing).toBe(false)
  })

  it("handles three distinct prefixes", () => {
    const sourceFile = makeSourceFile(`
      export const userCanCreate = () => {}
      export const orderCanPlace = () => {}
      export const paymentProcess = () => {}
    `)
    const result = checkPrefixes(sourceFile)
    expect(result.hasMixing).toBe(true)
    expect(result.prefixes.size).toBe(3)
  })
})
