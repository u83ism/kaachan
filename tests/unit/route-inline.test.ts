import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import type { KaachanConfig } from "../../src/types/config.js"

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

describe("route-inline rule — inline handler detection", () => {
  it("emits warning for each inline arrow function handler in route.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "route-inline" && d.severity === "warning",
    )
    const inlineWarnings = warnings.filter((d) => d.message.includes("inline handler"))
    expect(inlineWarnings.length).toBeGreaterThanOrEqual(2)
  })

  it("includes the HTTP method name in the inline handler message", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "route-inline" && d.message.includes("inline handler"),
    )
    expect(warnings.some((d) => d.message.includes(".get("))).toBe(true)
    expect(warnings.some((d) => d.message.includes(".post("))).toBe(true)
  })

  it("emits warning for function expression inline handler", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "route-inline" && d.message.includes("inline handler"),
    )
    // router.delete uses function expression
    expect(warnings.some((d) => d.message.includes(".delete("))).toBe(true)
  })

  it("does not flag route.ts with only imported handler references", async () => {
    // lv2 clean fixture has only `export {}` in route.ts — no inline handlers
    const result = await analyze(makeConfig(join(fixturesDir, "lv2")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "route-inline" && d.message.includes("inline handler"),
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
      (d) => d.ruleId === "route-inline" && d.message.includes("auth library"),
    )
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.some((d) => d.message.includes("jsonwebtoken"))).toBe(true)
  })

  it("does not flag workflow.ts without auth library imports", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "route-inline" && d.message.includes("auth library"),
    )
    expect(warnings).toHaveLength(0)
  })
})

describe("route-inline rule — activation", () => {
  it("does not activate at Lv1 (no workflow.ts or middleware.ts)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv1")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "route-inline")
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

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "route-inline")
    expect(diags).toHaveLength(0)
  })
})
