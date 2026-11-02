import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import type { KaachanConfig } from "../../src/types/config.js"
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
})

const diagnosticsOf = async (fixture: string): Promise<readonly Diagnostic[]> => {
  const result = await analyze(makeConfig(join(fixturesDir, fixture)))
  if (!result.ok) throw new Error(result.error)
  return result.value.diagnostics.filter((d) => isFrom(d, "domain-merge-hints"))
}

describe("domain-merge-hints rule — domain-pair-coordinated", () => {
  it("hints at a domain pair imported together by two or more app/ files", async () => {
    const diags = (await diagnosticsOf("lv6-merge-hints")).filter((d) => d.ruleId === "domain-pair-coordinated")
    expect(diags.map((d) => `${d.severity}: ${d.message}`)).toEqual([
      "hint: domains/order and domains/user are called together in 2 app/ or orchestrate/ files",
    ])
    expect(diags[0]?.details).toEqual(["app/report.ts", "app/workflow.ts"])
  })

  it("does not hint at a pair coordinated in a single file", async () => {
    const diags = await diagnosticsOf("lv6-merge-hints")
    expect(diags.some((d) => d.message.includes("billing") && d.ruleId === "domain-pair-coordinated")).toBe(false)
  })
})

describe("domain-merge-hints rule — domain-folder-thin", () => {
  it("hints at a domain with fewer than 50 lines of non-test code", async () => {
    const diags = (await diagnosticsOf("lv6-merge-hints")).filter((d) => d.ruleId === "domain-folder-thin")
    expect(diags.map((d) => `${d.severity}: ${d.message}`)).toEqual(["hint: domains/order/ has only 2 lines of code"])
  })

  it("is not active below Lv6", async () => {
    expect(await diagnosticsOf("lv5-with-test")).toHaveLength(0)
  })
})
