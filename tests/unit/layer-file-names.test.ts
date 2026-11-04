import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import { damerauLevenshtein } from "../../src/analysis/edit-distance.js"
import type { AnalysisResult, KaachanConfig } from "../../src/types/config.js"
import type { Diagnostic } from "../../src/types/diagnostic.js"
import { isFrom } from "../helpers.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, "../fixtures")

const makeConfig = (rootDir: string): KaachanConfig => ({
  rootDir,
  disabledRules: [],
  thresholds: {
    hintLines: 300,
    hintFunctions: 10,
    warningLines: 500,
    errorLogicFolderLines: 300,
  },
  today: "2026-11-05",
})

const analyzeFixture = async (fixture: string): Promise<AnalysisResult> => {
  const result = await analyze(makeConfig(join(fixturesDir, fixture)))
  if (!result.ok) throw new Error(result.error)
  return result.value
}

const diagnosticsOf = async (fixture: string): Promise<readonly Diagnostic[]> =>
  (await analyzeFixture(fixture)).diagnostics.filter((d) => isFrom(d, "layer-file-names"))

const summaries = (diags: readonly Diagnostic[]): readonly string[] =>
  diags.map((d) => `${d.severity} ${d.ruleId} ${d.message}`).sort()

describe("damerauLevenshtein", () => {
  it("counts insertions, deletions and substitutions", () => {
    expect(damerauLevenshtein("workflow", "workflow")).toBe(0)
    expect(damerauLevenshtein("workfow", "workflow")).toBe(1)
    expect(damerauLevenshtein("logs", "logic")).toBe(2)
    expect(damerauLevenshtein("", "abc")).toBe(3)
  })

  it("counts a transposition of adjacent characters as one edit", () => {
    expect(damerauLevenshtein("errros", "errors")).toBe(1)
    expect(damerauLevenshtein("wrokflow", "workflow")).toBe(1)
  })
})

describe("layer-file-names rule", () => {
  it("warns at a misspelled layer file at Lv2 but leaves other names alone until Lv3", async () => {
    expect((await analyzeFixture("layer-file-names-lv2")).level).toBe(2)
    const diags = await diagnosticsOf("layer-file-names-lv2")
    expect(summaries(diags)).toEqual(["warning layer-file-typo midleware.ts looks like a misspelling of middleware.ts"])
    expect(diags[0]?.suggestion).toContain("Rename it to middleware.ts")
  })

  it("reports misspellings and unknown names in the source root at Lv3", async () => {
    expect((await analyzeFixture("layer-file-names-lv3")).level).toBe(3)
    const diags = await diagnosticsOf("layer-file-names-lv3")
    // helpers.test.ts (test files are only checked for misspellings), env.d.ts
    // and parse/ (file names are free inside it) are not reported
    expect(summaries(diags)).toEqual([
      "hint layer-file-unknown service.ts is not a layer file name recognized in the source root",
      "warning layer-file-typo errros.ts looks like a misspelling of errors.ts",
      "warning layer-file-typo parze.test.ts looks like a misspelling of parse.ts",
    ])
  })

  it("keeps the test suffix in the suggested name", async () => {
    const diags = await diagnosticsOf("layer-file-names-lv3")
    expect(diags.find((d) => d.message.startsWith("parze.test.ts"))?.suggestion).toContain("Rename it to parse.test.ts")
  })

  it("names the layers recognized in the folder of an unknown file", async () => {
    const diags = await diagnosticsOf("layer-file-names-lv3")
    const suggestion = diags.find((d) => d.ruleId === "layer-file-unknown")?.suggestion
    expect(suggestion).toContain("logic.ts (pure business rules)")
    expect(suggestion).toContain("store.ts (database access)")
  })

  it("checks shared/ and domains/*, ignoring case, - and _", async () => {
    expect((await analyzeFixture("layer-file-names-lv6")).level).toBe(6)
    const diags = await diagnosticsOf("layer-file-names-lv6")
    expect(summaries(diags)).toEqual([
      "hint layer-file-unknown shared/helpers.ts is not a layer file name recognized in shared/",
      "warning layer-file-typo domains/user/wokflow.ts looks like a misspelling of workflow.ts",
      "warning layer-file-typo shared/small-logic.ts looks like a misspelling of smallLogic.ts",
    ])
  })
})
