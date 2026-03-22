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

describe("parse-violations rule — parse.ts DB access", () => {
  it("emits error when parse.ts imports an ORM package", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "parse-violations" && d.severity === "error",
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain("@prisma/client")
  })

  it("emits no error when parse.ts has no DB imports", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "parse-violations" && d.severity === "error",
    )
    expect(errors).toHaveLength(0)
  })

  it("does not activate at Lv2 (no parse.ts and no workflow with JSON.parse)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv2")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "parse-violations")
    expect(diagnostics).toHaveLength(0)
  })
})

describe("parse-violations rule — workflow.ts inline parse", () => {
  it("emits warning when workflow.ts calls JSON.parse()", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "parse-violations" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toContain("JSON.parse")
  })

  it("includes line number in warning location", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warning = result.value.diagnostics.find(
      (d) => d.ruleId === "parse-violations" && d.severity === "warning",
    )
    expect(warning?.location.line).toBeDefined()
  })

  it("emits no warning when workflow.ts does not call JSON.parse()", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "parse-violations" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv3-violations"), {
        disabledRules: ["parse-violations"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "parse-violations")
    expect(diagnostics).toHaveLength(0)
  })
})
