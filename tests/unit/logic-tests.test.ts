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

describe("logic-tests rule", () => {
  it("emits warning when logic.ts has no test file (Lv5)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-tests")
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.severity).toBe("warning")
  })

  it("includes the logic file name in the message", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostic = result.value.diagnostics.find((d) => d.ruleId === "logic-tests")
    expect(diagnostic?.message).toContain("logic.ts")
  })

  it("provides candidate test paths in details", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostic = result.value.diagnostics.find((d) => d.ruleId === "logic-tests")
    expect(diagnostic?.details).toBeDefined()
    expect((diagnostic?.details ?? []).length).toBeGreaterThan(0)
  })

  it("emits no diagnostics when logic.test.ts exists alongside logic.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-with-test")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-tests")
    expect(diagnostics).toHaveLength(0)
  })

  it("does not activate at Lv4 (no logic layer)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-tests")
    expect(diagnostics).toHaveLength(0)
  })

  it("emits one warning per logic/ folder file missing a test", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-violations-folder")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // lv5-violations-folder has logic/user.ts with no test
    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-tests")
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.severity).toBe("warning")
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv5"), { disabledRules: ["logic-tests"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "logic-tests")
    expect(diagnostics).toHaveLength(0)
  })
})
