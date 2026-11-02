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

describe("workflow-throws rule", () => {
  it("emits warning for each throw new Error() in workflow.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-workflow-new-error")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => isFrom(d, "workflow-throws"))
    expect(diags).toHaveLength(2)
    expect(diags.every((d) => d.severity === "warning")).toBe(true)
  })

  it("advises returning err() from Lv5", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-workflow-new-error")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diag = result.value.diagnostics.find((d) => isFrom(d, "workflow-throws"))
    expect(diag?.message).toContain("err()")
    expect(diag?.message).not.toContain("DomainError")
  })

  it("advises throwing a DomainError in Lv3–4", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3-workflow-new-error")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.level).toBe(3)
    const diags = result.value.diagnostics.filter((d) => isFrom(d, "workflow-throws"))
    expect(diags).toHaveLength(2)
    expect(diags.every((d) => d.message.includes("DomainError"))).toBe(true)
    expect(diags.every((d) => !d.message.includes("err()"))).toBe(true)
  })

  it("emits no diagnostics when workflow.ts has no new Error() throws", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => isFrom(d, "workflow-throws"))
    expect(diags).toHaveLength(0)
  })

  it("does not activate at Lv4 (rule active from Lv5)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => isFrom(d, "workflow-throws"))
    expect(diags).toHaveLength(0)
  })

  it("hints at a workflow throwing DomainError from Lv5", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-domain-error")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.level).toBe(5)
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "workflow-throws-domain-error")
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("hint")
    expect(diags[0]?.message).toContain("err()")
  })

  it("does not report DomainError throws in Lv3–4, where they are the recommended form", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3-workflow-new-error")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.diagnostics.filter((d) => d.ruleId === "workflow-throws-domain-error")).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv5-workflow-new-error"), {
        disabledRules: ["workflow-throws"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => isFrom(d, "workflow-throws"))
    expect(diags).toHaveLength(0)
  })
})
