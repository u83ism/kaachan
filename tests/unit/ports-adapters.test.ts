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

const summaries = (diags: readonly Diagnostic[], ruleId: string): readonly string[] =>
  diags.filter((d) => d.ruleId === ruleId).map((d) => `${d.severity}: ${d.message}`)


describe("ports-adapters rule", () => {
  it("reports a domain importing infrastructure/ as an error", async () => {
    expect(summaries(await diagnosticsOf("lv9-ports", "ports-adapters"), "domain-imports-infrastructure")).toEqual([
      'error: domains/user/ imports "../../infrastructure/user/prismaAdapter.js" — a domain must not know the implementation of its ports',
    ])
  })

  it("reports implementation code in ports.ts but not its types", async () => {
    const diags = (await diagnosticsOf("lv9-ports", "ports-adapters")).filter(
      (d) => d.ruleId === "ports-has-implementation",
    )
    expect(diags.map((d) => `${d.severity}: ${d.message}`)).toEqual([
      "error: domains/user/ports.ts contains implementation code (VariableStatement) — ports.ts holds type definitions only",
    ])
    expect(diags[0]?.location.line).toBe(9)
  })

  it("reports a store.ts left at Lv9", async () => {
    expect(summaries(await diagnosticsOf("lv9-ports", "ports-adapters"), "store-remains")).toEqual([
      "error: domains/order/store.ts still exists — from Lv9 store.ts splits into ports.ts and infrastructure/",
    ])
  })

  it("is not active below Lv9", async () => {
    expect(await diagnosticsOf("lv6-tables", "ports-adapters")).toHaveLength(0)
  })

  it("reports a missing infrastructure/ when a domain has ports.ts (mid-migration)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv9-no-infrastructure")))
    if (!result.ok) throw new Error(result.error)
    expect(result.value.level).toBe(9)
    const diags = result.value.diagnostics.filter((d) => isFrom(d, "ports-adapters"))
    expect(summaries(diags, "infrastructure-missing")).toEqual([
      "warning: infrastructure/ does not exist although a domain has ports.ts — the move to Ports & Adapters is not finished",
    ])
  })
})
