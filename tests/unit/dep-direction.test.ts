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

describe("dep-direction rule — cross-domain imports", () => {
  it("emits error when one domain imports from another", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => isFrom(d, "dep-direction") && d.severity === "error",
    )
    const crossDomainError = errors.find((d) => d.ruleId === "domain-undeclared-import")
    expect(crossDomainError).toBeDefined()
    expect(crossDomainError?.message).toContain("domains/order/ imports domains/user/")
  })

  it("does not flag a file outside app/ that imports from a domain (replaced by the domain DAG)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const outsideApp = result.value.diagnostics.filter(
      (d) => isFrom(d, "dep-direction") && d.message.includes("outside app/"),
    )
    expect(outsideApp).toHaveLength(0)
  })

  it("emits warning when shared/ imports from a domain", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "dep-direction") && d.severity === "warning",
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toContain('"user"')
  })

  it("does not emit error for app/ importing from a domain", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => isFrom(d, "dep-direction"))
    const appFilePath = join(fixturesDir, "lv6-violations", "app", "index.ts")
    const appViolations = diagnostics.filter((d) => d.location.filePath === appFilePath)
    expect(appViolations).toHaveLength(0)
  })

  it("does not activate below Lv6 (no domain folders)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => isFrom(d, "dep-direction"))
    expect(diagnostics).toHaveLength(0)
  })

  it("emits no diagnostics for clean Lv6 project", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => isFrom(d, "dep-direction"))
    expect(diagnostics).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv6-violations"), { disabledRules: ["dep-direction"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => isFrom(d, "dep-direction"))
    expect(diagnostics).toHaveLength(0)
  })
})

describe("dep-direction rule — domains declared in slime.config.ts", () => {
  it("allows declared domain-to-domain imports and reports only the undeclared one", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-declared-deps")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.value.level).toBe(6)
    const undeclared = result.value.diagnostics.filter((d) => d.ruleId === "domain-undeclared-import")
    expect(undeclared).toHaveLength(1)
    expect(undeclared[0]?.severity).toBe("error")
    expect(undeclared[0]?.message).toContain("domains/auth/ imports domains/order/")
  })

  it("stops the analysis when slime.config.ts cannot be read statically", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-unreadable-config")))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain("slime.config.ts")
  })
})
