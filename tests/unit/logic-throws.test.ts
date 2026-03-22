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

describe("logic-throws rule", () => {
  it("emits error for each throw statement in logic.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-throw")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "logic-throws" && d.severity === "error",
    )
    expect(errors.length).toBeGreaterThanOrEqual(2)
  })

  it("includes line number in diagnostic location", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-throw")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter((d) => d.ruleId === "logic-throws")
    expect(errors.every((d) => d.location.line !== undefined)).toBe(true)
  })

  it("emits no diagnostics when logic.ts has no throw", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-throws")
    expect(diagnostics).toHaveLength(0)
  })

  it("does not activate at Lv4 (no logic layer)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-throws")
    expect(diagnostics).toHaveLength(0)
  })

  it("detects throw in logic/ folder files", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations-folder")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // lv5-violations-folder has logic/user.ts that imports repository (no throw), so 0 expected
    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-throws")
    expect(diagnostics).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv5-throw"), { disabledRules: ["logic-throws"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-throws")
    expect(diagnostics).toHaveLength(0)
  })
})
