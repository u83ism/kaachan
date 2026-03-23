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

describe("workflow-throws rule", () => {
  it("emits warning for each throw new Error() in workflow.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-workflow-new-error")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "workflow-throws")
    expect(diags).toHaveLength(2)
    expect(diags.every((d) => d.severity === "warning")).toBe(true)
  })

  it("warning message mentions DomainError and Result", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-workflow-new-error")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diag = result.value.diagnostics.find((d) => d.ruleId === "workflow-throws")
    expect(diag?.message).toContain("DomainError")
    expect(diag?.message).toContain("Result")
  })

  it("emits no diagnostics when workflow.ts has no new Error() throws", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "workflow-throws")
    expect(diags).toHaveLength(0)
  })

  it("does not activate at Lv4 (rule active from Lv5)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "workflow-throws")
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv5-workflow-new-error"), {
        disabledRules: ["workflow-throws"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "workflow-throws")
    expect(diags).toHaveLength(0)
  })
})
