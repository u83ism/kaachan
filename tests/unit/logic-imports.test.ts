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

describe("logic-imports rule — logic.ts violations", () => {
  it("emits error when logic.ts imports repository.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "logic-imports" && d.severity === "error",
    )
    const repositoryError = errors.find((d) => d.message.includes("repository"))
    expect(repositoryError).toBeDefined()
  })

  it("emits error when logic.ts imports client.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "logic-imports" && d.severity === "error",
    )
    const clientError = errors.find((d) => d.message.includes("client"))
    expect(clientError).toBeDefined()
  })

  it("emits two errors total (one per forbidden import)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter((d) => d.ruleId === "logic-imports")
    expect(errors).toHaveLength(2)
  })

  it("does not activate at Lv4 (no logic.ts)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-imports")
    expect(diagnostics).toHaveLength(0)
  })

  it("emits no errors when logic.ts has no forbidden imports", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-imports")
    expect(diagnostics).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv5-violations"), { disabledRules: ["logic-imports"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-imports")
    expect(diagnostics).toHaveLength(0)
  })
})

describe("logic-imports rule — logic/ folder violations", () => {
  it("emits error when logic/*.ts imports repository.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations-folder")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "logic-imports" && d.severity === "error",
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toContain("repository")
  })
})
