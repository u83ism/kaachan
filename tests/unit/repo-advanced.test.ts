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

describe("repo-advanced rule — repository ORM type leak", () => {
  it("emits warning for each exported function whose return type annotation includes an ORM type", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4-orm-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-advanced" && d.severity === "warning" && d.message.includes("ORM type"),
    )
    // findUserById and listUsers both expose User from @prisma/client
    expect(warnings.length).toBeGreaterThanOrEqual(2)
  })

  it("warning message includes the leaked type name", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4-orm-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warning = result.value.diagnostics.find(
      (d) => d.ruleId === "repo-advanced" && d.message.includes("ORM type"),
    )
    expect(warning?.message).toContain("User")
  })

  it("emits no ORM-leak warning when repository.ts has no ORM imports", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-advanced" && d.message.includes("ORM type"),
    )
    expect(warnings).toHaveLength(0)
  })

  it("does not activate at Lv3 (no repository.ts)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "repo-advanced")
    expect(diagnostics).toHaveLength(0)
  })
})

describe("repo-advanced rule — workflow $transaction direct call", () => {
  it("emits warning when workflow.ts calls $transaction() directly", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4-orm-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-advanced" && d.message.includes("$transaction"),
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.severity).toBe("warning")
  })

  it("includes line number in warning location", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4-orm-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warning = result.value.diagnostics.find(
      (d) => d.ruleId === "repo-advanced" && d.message.includes("$transaction"),
    )
    expect(warning?.location.line).toBeDefined()
  })

  it("emits no warning when workflow.ts does not call $transaction()", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-advanced" && d.message.includes("$transaction"),
    )
    expect(warnings).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv4-orm-violations"), {
        disabledRules: ["repo-advanced"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "repo-advanced")
    expect(diagnostics).toHaveLength(0)
  })
})
