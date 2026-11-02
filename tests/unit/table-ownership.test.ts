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
  return result.value.diagnostics.filter((d) => isFrom(d, "table-ownership"))
}

const byRule = (diags: readonly Diagnostic[], ruleId: string): readonly string[] =>
  diags.filter((d) => d.ruleId === ruleId).map((d) => `${d.severity}: ${d.message}`)

describe("table-ownership rule — Lv6", () => {
  it("reports a write to another domain's table as an error", async () => {
    expect(byRule(await diagnosticsOf("lv6-tables"), "table-foreign-write")).toEqual([
      'error: domains/user writes to table "order", owned by order',
    ])
  })

  it("hints at a direct read of another domain's table, once per file and table", async () => {
    expect(byRule(await diagnosticsOf("lv6-tables"), "table-foreign-read")).toEqual([
      'hint: domains/order reads table "user", owned by user, directly',
    ])
  })

  it("hints at tables with no declared owner, including Drizzle tables", async () => {
    expect(byRule(await diagnosticsOf("lv6-tables"), "table-owner-undeclared")).toEqual([
      'hint: domains/order touches table "auditLog", which has no declared owner',
      'hint: domains/user touches table "session", which has no declared owner',
    ])
  })

  it("reports a table declared by more than one domain", async () => {
    const diags = await diagnosticsOf("lv6-tables")
    expect(byRule(diags, "table-owner-duplicate")).toEqual([
      'error: slime.config.ts declares table "userProfile" for more than one domain: user, order',
    ])
  })
})

describe("table-ownership rule — Lv10 adapters", () => {
  it("warns at a cross-domain read in a write-side adapter", async () => {
    const diags = await diagnosticsOf("lv10-tables")
    expect(byRule(diags, "table-foreign-read")).toEqual([
      'warning: domains/order reads table "user", owned by user, directly',
    ])
    expect(diags.find((d) => d.ruleId === "table-foreign-read")?.location.filePath).toContain("commandAdapter.ts")
  })

  it("allows a query/ read-side adapter to read across owners", async () => {
    const diags = await diagnosticsOf("lv10-tables")
    expect(diags.some((d) => d.location.filePath.includes("queryAdapter.ts"))).toBe(false)
  })
})
