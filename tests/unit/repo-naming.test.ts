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

describe("repo-naming rule — repository naming convention", () => {
  it("emits hint for each non-conventional exported function name", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-naming" && d.severity === "hint",
    )
    // fetchUserById, retrieveOrders, loadProductCatalog → 3 hints
    expect(hints).toHaveLength(3)
    expect(hints.map((d) => d.message)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("fetchUserById"),
        expect.stringContaining("retrieveOrders"),
        expect.stringContaining("loadProductCatalog"),
      ]),
    )
  })

  it("does not emit hints for conventionally named functions", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-naming" && d.severity === "hint",
    )
    const messages = hints.map((d) => d.message)
    expect(messages.every((m) => !m.includes("findUserByEmail"))).toBe(true)
    expect(messages.every((m) => !m.includes("createUser"))).toBe(true)
  })

  it("does not activate at Lv3 (no repository.ts)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const repoHints = result.value.diagnostics.filter((d) => d.ruleId === "repo-naming")
    expect(repoHints).toHaveLength(0)
  })

  it("emits no hints when all names are conventional", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const repoHints = result.value.diagnostics.filter((d) => d.ruleId === "repo-naming")
    expect(repoHints).toHaveLength(0)
  })
})

describe("repo-naming rule — workflow ORM import", () => {
  it("emits warning when workflow.ts imports ORM directly", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-naming" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toContain("@prisma/client")
  })

  it("does not emit warning when workflow.ts has no ORM imports", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "repo-naming" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv4-violations"), { disabledRules: ["repo-naming"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const repoRuleDiagnostics = result.value.diagnostics.filter((d) => d.ruleId === "repo-naming")
    expect(repoRuleDiagnostics).toHaveLength(0)
  })
})
