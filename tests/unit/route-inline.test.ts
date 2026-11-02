import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import type { KaachanConfig } from "../../src/types/config.js"
import { isFrom } from "../helpers.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, "../fixtures")

const makeConfig = (rootDir: string, overrides?: Partial<KaachanConfig>): KaachanConfig => ({
  rootDir,
  disabledRules: [],
  thresholds: {
    hintLines: 300,
    hintFunctions: 10,
    warningLines: 500,
    errorLogicFolderLines: 300,
  },
  ...overrides,
})

describe("route-inline rule — route handlers doing non-HTTP work", () => {
  it("emits a route-handler-non-http hint at Lv2 for each inline handler that calls the database", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const inlineHints = result.value.diagnostics.filter(
      (d) => d.ruleId === "route-handler-non-http" && d.message.includes("HTTP I/O"),
    )
    expect(inlineHints).toHaveLength(3)
    expect(inlineHints.every((d) => d.severity === "hint")).toBe(true)
  })

  it("includes the HTTP method name in the inline handler message", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "route-inline") && d.message.includes("HTTP I/O"),
    )
    expect(warnings.some((d) => d.message.includes(".get("))).toBe(true)
    expect(warnings.some((d) => d.message.includes(".post("))).toBe(true)
  })

  it("flags a function expression handler too", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "route-inline") && d.message.includes("HTTP I/O"),
    )
    // router.delete uses function expression
    expect(warnings.some((d) => d.message.includes(".delete("))).toBe(true)
  })

  it("names the store/logic/DB identifiers the handler uses", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const get = result.value.diagnostics.find(
      (d) => d.ruleId === "route-handler-non-http" && d.message.includes(".get("),
    )
    expect(get?.message).toContain("prisma")
  })

  it("does not flag a thin handler that only calls a workflow and sets HTTP output", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const handlers = result.value.diagnostics.filter((d) => d.ruleId === "route-handler-non-http")
    expect(handlers).toHaveLength(3)
    expect(handlers.every((d) => !d.message.includes(".put("))).toBe(true)
  })

  it("does not flag route.ts with only imported handler references", async () => {
    // lv2 clean fixture has only `export {}` in route.ts — no inline handlers
    const result = await analyze(makeConfig(join(fixturesDir, "lv2")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "route-inline") && d.message.includes("HTTP I/O"),
    )
    expect(warnings).toHaveLength(0)
  })
})

describe("route-inline rule — auth library in workflow", () => {
  it("emits warning when workflow.ts imports an auth library", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "route-inline") && d.message.includes("auth library"),
    )
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.some((d) => d.message.includes("jsonwebtoken"))).toBe(true)
  })

  it("does not flag workflow.ts without auth library imports", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "route-inline") && d.message.includes("auth library"),
    )
    expect(warnings).toHaveLength(0)
  })
})

describe("route-inline rule — activation", () => {
  it("does not activate at Lv1 (no workflow.ts or middleware.ts)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv1")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => isFrom(d, "route-inline"))
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv2-violations"), {
        disabledRules: ["route-inline"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => isFrom(d, "route-inline"))
    expect(diags).toHaveLength(0)
  })
})
