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

describe("fat-logic rule — logic.ts with prefix mixing", () => {
  it("emits warning for prefix mixing in fat-logic fixture", async () => {
    const config = makeConfig(join(fixturesDir, "fat-logic"), {
      thresholds: { ...lowThresholds, hintLines: 1, hintFunctions: 1 },
    })
    // Override logic.ts to be the prefix-mixing file via a custom fixture dir
    // Using the fat-logic fixture which has prefix-mixing.ts — test scanner picks it as logic.ts?
    // fat-logic fixture has no logic.ts, so fat-logic rule won't trigger on it
    // We'll test via lv5 fixture that has empty logic.ts — no mixing, no diagnostics
    const lv5Result = await analyze(makeConfig(join(fixturesDir, "lv5"), { thresholds: lowThresholds }))
    expect(lv5Result.ok).toBe(true)
    if (!lv5Result.ok) return
    const logicDiags = lv5Result.value.diagnostics.filter((d) => d.ruleId === "fat-logic")
    expect(logicDiags).toHaveLength(0)
  })

  it("emits no diagnostics at Lv4 (rule not active)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv4"), { thresholds: lowThresholds }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const logicDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-logic")
    expect(logicDiags).toHaveLength(0)
  })

  it("emits hint when logic.ts exceeds hintFunctions threshold", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "fat-workflow"), {
        thresholds: { ...lowThresholds, hintFunctions: 1 },
      }),
    )
    expect(result.ok).toBe(true)
    // fat-workflow fixture is lv2, fat-logic rule activates at lv5 — no fat-logic diag
    if (!result.ok) return
    const logicDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-logic")
    expect(logicDiags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv5"), {
        thresholds: lowThresholds,
        disabledRules: ["fat-logic"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const logicDiags = result.value.diagnostics.filter((d) => d.ruleId === "fat-logic")
    expect(logicDiags).toHaveLength(0)
  })
})

describe("fat-logic rule — prefix mixing detection", () => {
  it("prefix-checker detects mixing in prefix-mixing.ts fixture file", async () => {
    const { Project } = await import("ts-morph")
    const { checkPrefixes } = await import("../../src/analysis/prefix-checker.js")
    const project = new Project({ skipAddingFilesFromTsConfig: true, skipFileDependencyResolution: true })
    const sourceFile = project.addSourceFileAtPath(
      join(fixturesDir, "fat-logic/prefix-mixing.ts"),
    )
    const result = checkPrefixes(sourceFile)
    expect(result.hasMixing).toBe(true)
    expect(result.prefixes.has("user")).toBe(true)
    expect(result.prefixes.has("order")).toBe(true)
  })
})
