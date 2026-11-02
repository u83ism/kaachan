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

describe("store-filter rule", () => {
  it("hints at open column names and operators in store filter types", async () => {
    const diags = await diagnosticsOf("lv4-store-queries", "store-filter")
    expect(diags.every((d) => d.ruleId === "store-generic-filter" && d.severity === "hint")).toBe(true)
    expect(diags.map((d) => d.message)).toEqual([
      'store.ts: "column: string" is open — any column or operator can be passed',
      'store.ts: searchUsers() takes "conditions: Record<string, unknown>" — column names are open',
    ])
  })

  it("does not flag literal unions such as orderBy or op", async () => {
    const diags = await diagnosticsOf("lv4-store-queries", "store-filter")
    expect(diags.some((d) => d.message.includes("orderBy") || d.message.includes('"op'))).toBe(false)
  })
})
