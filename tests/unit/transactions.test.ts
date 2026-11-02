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

const diagnosticsOf = async (
  fixture: string,
  moduleId: string,
  overrides?: Partial<KaachanConfig>,
): Promise<readonly Diagnostic[]> => {
  const result = await analyze(makeConfig(join(fixturesDir, fixture), overrides))
  if (!result.ok) throw new Error(result.error)
  return result.value.diagnostics.filter((d) => isFrom(d, moduleId))
}

describe("transactions rule — coordinators without withTransaction()", () => {
  it("warns at a coordinator with no withTransaction() from Lv8", async () => {
    const diags = (await diagnosticsOf("lv8-orchestrate", "transactions")).filter(
      (d) => d.ruleId === "orchestrate-without-transaction",
    )
    expect(diags.map((d) => `${d.severity}: ${d.message}`)).toEqual([
      "warning: orchestrate/billing/ has no withTransaction() — from Lv8 coordinators exist for atomic multi-domain updates",
    ])
  })

  it("is not active at Lv7", async () => {
    const diags = await diagnosticsOf("lv7-violations", "transactions")
    expect(diags.filter((d) => d.ruleId === "orchestrate-without-transaction")).toHaveLength(0)
  })
})

describe("transactions rule — defer-suggestion (opt-in)", () => {
  it("is not reported unless enabled", async () => {
    const diags = await diagnosticsOf("lv8-orchestrate", "transactions")
    expect(diags.filter((d) => d.ruleId === "defer-suggestion")).toHaveLength(0)
  })

  it("hints at client calls inside withTransaction() but not inside defer()", async () => {
    const diags = (
      await diagnosticsOf("lv8-orchestrate", "transactions", { enabledRules: ["defer-suggestion"] })
    ).filter((d) => d.ruleId === "defer-suggestion")
    expect(diags.map((d) => `${d.severity}: ${d.message}`)).toEqual([
      "hint: sendOrderMail() runs inside withTransaction() — non-DB work holds the transaction open and cannot be rolled back",
    ])
    expect(diags[0]?.location.line).toBe(10)
  })
})
