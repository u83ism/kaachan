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

describe("slime-config-hint rule", () => {
  it("emits hint when slime.config.ts is absent at Lv5", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "slime-config-hint")
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("hint")
  })

  it("hint message mentions slime.config.ts and DomainError", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diag = result.value.diagnostics.find((d) => d.ruleId === "slime-config-hint")
    expect(diag?.message).toContain("slime.config.ts")
    expect(diag?.message).toContain("DomainError")
  })

  it("emits no diagnostics when slime.config.ts is present", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-with-slime-config")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "slime-config-hint")
    expect(diags).toHaveLength(0)
  })

  it("does not activate at Lv4", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "slime-config-hint")
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv5"), { disabledRules: ["slime-config-hint"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const diags = result.value.diagnostics.filter((d) => d.ruleId === "slime-config-hint")
    expect(diags).toHaveLength(0)
  })
})
