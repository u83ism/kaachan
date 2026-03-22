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
  format: "console",
  disabledRules: [],
  thresholds: {
    hintLines: 300,
    hintFunctions: 10,
    warningLines: 500,
    errorLogicFolderLines: 300,
  },
  ...overrides,
})

const lowThresholds = {
  hintLines: 3,
  hintFunctions: 3,
  warningLines: 10,
  errorLogicFolderLines: 3,
}

describe("fat-parse rule", () => {
  it("emits no diagnostics when parse.ts is within thresholds", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "fat-parse")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parseDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-parse")
    expect(parseDiags).toHaveLength(0)
  })

  it("emits hint when function count exceeds hintFunctions threshold", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-parse"), { thresholds: lowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parseDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-parse")
    expect(parseDiags).toHaveLength(1)
    expect(parseDiags[0]?.severity).toBe("hint")
  })

  it("hint message mentions shared schemas are allowed", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-parse"), { thresholds: lowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diag = result.value.diagnostics.find((d) => d.ruleId === "fat-parse")
    expect(diag?.message).toContain("shared schemas")
  })

  it("emits warning when line count exceeds warningLines threshold", async () => {
    const veryLowThresholds = { ...lowThresholds, hintLines: 1, warningLines: 3 }
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-parse"), { thresholds: veryLowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diag = result.value.diagnostics.find((d) => d.ruleId === "fat-parse")
    expect(diag?.severity).toBe("warning")
    expect(diag?.suggestion).toContain("shared schemas are allowed")
  })

  it("does not activate at Lv2 (no parse.ts)", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv2"), { thresholds: lowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parseDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-parse")
    expect(parseDiags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-parse"), {
        thresholds: lowThresholds,
        disabledRules: ["fat-parse"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const parseDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-parse")
    expect(parseDiags).toHaveLength(0)
  })
})
