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

describe("nested-domain rule — parent→child isolation", () => {
  it("emits error when app/ imports from a domain nested subdomain path", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "nested-domain" && d.severity === "error",
    )
    expect(errors.length).toBeGreaterThanOrEqual(1)
    // app/service.ts importing domainUser/core/utils.ts should be flagged
    expect(errors.some((d) => d.location.filePath.includes("app"))).toBe(true)
    expect(errors.some((d) => d.message.includes("domainUser"))).toBe(true)
  })

  it("does not flag domain importing its own nested subdomain", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter((d) => d.ruleId === "nested-domain")
    // domainUser/workflow.ts imports domainUser/core/utils.ts — must NOT be flagged
    expect(
      errors.every((d) => !d.location.filePath.includes("domainUser/workflow")),
    ).toBe(true)
  })

  it("does not flag top-level domain file imports (non-nested)", async () => {
    // lv7-app-violations has no nested subdomains — should produce no nested-domain errors
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter((d) => d.ruleId === "nested-domain")
    expect(errors).toHaveLength(0)
  })
})

describe("nested-domain rule — activation", () => {
  it("does not activate at Lv6 (no cross- folder)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "nested-domain")
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv7-violations"), { disabledRules: ["nested-domain"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "nested-domain")
    expect(diags).toHaveLength(0)
  })
})
