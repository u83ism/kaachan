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

describe("cross-folder-concerns rule — external service detection", () => {
  it("emits warning when cross- folder imports an external service package", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "cross-folder-concerns" && d.severity === "warning",
    )
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.some((d) => d.message.includes("nodemailer"))).toBe(true)
    expect(warnings.some((d) => d.message.includes("cross-order"))).toBe(true)
  })

  it("does not flag cross- folders with no external service imports", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-clean")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "cross-folder-concerns",
    )
    expect(warnings).toHaveLength(0)
  })
})

describe("cross-folder-concerns rule — activation", () => {
  it("does not activate at Lv7 (level < 8)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "cross-folder-concerns")
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv8-violations"), {
        disabledRules: ["cross-folder-concerns"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "cross-folder-concerns")
    expect(diags).toHaveLength(0)
  })
})
