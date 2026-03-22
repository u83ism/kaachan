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

describe("cqrs-enforcement rule — command/query boundary", () => {
  it("emits error when command/ imports from query/", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv10-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "cqrs-enforcement" && d.severity === "error",
    )
    expect(errors.length).toBeGreaterThanOrEqual(1)
    expect(errors.some((d) => d.message.includes("command/"))).toBe(true)
    expect(errors.some((d) => d.message.includes("query/"))).toBe(true)
    expect(errors.some((d) => d.location.filePath.includes("command"))).toBe(true)
  })
})

describe("cqrs-enforcement rule — query/ file bloat", () => {
  it("emits hint when a query/ file exceeds the hint threshold", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv10-violations"), { thresholds: lowThresholds }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => d.ruleId === "cqrs-enforcement" && d.severity === "hint",
    )
    expect(hints.length).toBeGreaterThanOrEqual(1)
    expect(hints.some((d) => d.message.includes("query/"))).toBe(true)
    expect(hints.some((d) => d.message.includes("lines"))).toBe(true)
  })

  it("does not emit hint when all query/ files are within threshold", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv10-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => d.ruleId === "cqrs-enforcement" && d.severity === "hint",
    )
    expect(hints).toHaveLength(0)
  })
})

describe("cqrs-enforcement rule — query/ shared abstraction", () => {
  it("emits warning when a query-internal helper is imported by 2+ query files", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv10-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "cqrs-enforcement" && d.severity === "warning",
    )
    const abstractionWarnings = warnings.filter((d) => d.message.includes("shared abstraction"))
    expect(abstractionWarnings.length).toBeGreaterThanOrEqual(1)
    // sharedHelper.ts is imported by both getUserQuery.ts and listUsersQuery.ts
    expect(abstractionWarnings.some((d) => d.location.filePath.includes("sharedHelper"))).toBe(
      true,
    )
  })
})

describe("cqrs-enforcement rule — query/ logic imports", () => {
  it("emits warning when query/ file imports domain logic", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv10-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "cqrs-enforcement" && d.severity === "warning",
    )
    const logicWarnings = warnings.filter((d) => d.message.includes("domain logic"))
    expect(logicWarnings.length).toBeGreaterThanOrEqual(1)
    expect(logicWarnings.some((d) => d.location.filePath.includes("detailQuery"))).toBe(true)
  })
})

describe("cqrs-enforcement rule — activation", () => {
  it("does not activate at Lv9 (no command/ or query/ subfolders)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv9-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "cqrs-enforcement")
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv10-violations"), {
        disabledRules: ["cqrs-enforcement"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "cqrs-enforcement")
    expect(diags).toHaveLength(0)
  })
})
