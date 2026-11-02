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

const diagnosticsOf = async (fixture: string, moduleId: string): Promise<readonly Diagnostic[]> => {
  const result = await analyze(makeConfig(join(fixturesDir, fixture)))
  if (!result.ok) throw new Error(result.error)
  return result.value.diagnostics.filter((d) => isFrom(d, moduleId))
}

describe("store-in-loop rule", () => {
  it("hints at store calls inside a for loop body and a map callback", async () => {
    const diags = await diagnosticsOf("lv4-store-queries", "store-in-loop")
    expect(diags.map((d) => d.message)).toEqual([
      "findUserById() is called inside a loop — this can cause N+1 queries",
      "findUserById() is called inside a loop — this can cause N+1 queries",
    ])
    expect(diags.every((d) => d.ruleId === "store-call-in-loop" && d.severity === "hint")).toBe(true)
  })

  it("does not flag the batch call or the iterated expression of a for...of loop", async () => {
    const diags = await diagnosticsOf("lv4-store-queries", "store-in-loop")
    expect(diags.some((d) => d.message.includes("listUsers") || d.message.includes("findUsersByIds"))).toBe(false)
  })
})
