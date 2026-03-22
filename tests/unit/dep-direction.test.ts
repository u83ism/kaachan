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

describe("dep-direction rule — cross-domain imports", () => {
  it("emits error when domainA imports from domainB", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "dep-direction" && d.severity === "error",
    )
    const crossDomainError = errors.find((d) => d.message.includes("Cross-domain import"))
    expect(crossDomainError).toBeDefined()
    expect(crossDomainError?.message).toContain("domainOrder")
    expect(crossDomainError?.message).toContain("domainUser")
  })

  it("emits error when a file outside app/ imports from a domain", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) =>
        d.ruleId === "dep-direction" &&
        d.severity === "error" &&
        d.message.includes("outside app/"),
    )
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]?.message).toContain("domainUser")
  })

  it("emits warning when shared/ imports from a domain", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "dep-direction" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toContain("domainUser")
  })

  it("does not emit error for app/ importing from a domain", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "dep-direction")
    const appFilePath = join(fixturesDir, "lv6-violations", "app", "index.ts")
    const appViolations = diagnostics.filter((d) => d.location.filePath === appFilePath)
    expect(appViolations).toHaveLength(0)
  })

  it("does not activate below Lv6 (no domain folders)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "dep-direction")
    expect(diagnostics).toHaveLength(0)
  })

  it("emits no diagnostics for clean Lv6 project", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "dep-direction")
    expect(diagnostics).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv6-violations"), { disabledRules: ["dep-direction"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "dep-direction")
    expect(diagnostics).toHaveLength(0)
  })
})
