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

const lowThresholds = {
  hintLines: 3,
  hintFunctions: 3,
  warningLines: 10,
  errorLogicFolderLines: 3,
}

describe("fat-workflow rule", () => {
  it("emits no diagnostics when workflow.ts is within thresholds", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "fat-workflow")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const workflowDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-workflow")
    expect(workflowDiags).toHaveLength(0)
  })

  it("emits hint when function count exceeds hintFunctions threshold", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-workflow"), { thresholds: lowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const workflowDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-workflow")
    expect(workflowDiags).toHaveLength(1)
    expect(workflowDiags[0]?.severity).toBe("hint")
  })

  it("hint message includes line and function counts", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-workflow"), { thresholds: lowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diag = result.value.diagnostics.find((d) => d.ruleId === "fat-workflow")
    expect(diag?.message).toContain("lines")
    expect(diag?.message).toContain("functions")
  })

  it("emits warning when line count exceeds warningLines threshold", async () => {
    const veryLowThresholds = { ...lowThresholds, hintLines: 1, warningLines: 3 }
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-workflow"), { thresholds: veryLowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diag = result.value.diagnostics.find((d) => d.ruleId === "fat-workflow")
    expect(diag?.severity).toBe("warning")
  })

  it("does not activate at Lv1 (no workflow.ts)", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv1"), { thresholds: lowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const workflowDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-workflow")
    expect(workflowDiags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-workflow"), {
        thresholds: lowThresholds,
        disabledRules: ["fat-workflow"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const workflowDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-workflow")
    expect(workflowDiags).toHaveLength(0)
  })
})
