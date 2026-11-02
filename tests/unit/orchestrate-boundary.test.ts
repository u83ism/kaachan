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

describe("orchestrate-boundary rule", () => {
  it("reports a domain importing a coordinator as an error", async () => {
    const diags = (await diagnosticsOf("lv8-orchestrate", "orchestrate-boundary")).filter(
      (d) => d.ruleId === "domain-imports-orchestrate",
    )
    expect(diags.map((d) => `${d.severity}: ${d.message}`)).toEqual([
      "error: domains/user/ imports orchestrate/order-inventory/ — coordinators stand above the domains",
    ])
  })

  it("reports coordinators importing each other as an error", async () => {
    const diags = (await diagnosticsOf("lv8-orchestrate", "orchestrate-boundary")).filter(
      (d) => d.ruleId === "orchestrate-imports-orchestrate",
    )
    expect(diags.map((d) => `${d.severity}: ${d.message}`)).toEqual([
      "error: orchestrate/order-inventory/ imports orchestrate/billing/ — coordinators must not depend on each other",
    ])
    expect(diags[0]?.location.line).toBe(5)
  })

  it("does not flag coordinators importing domains", async () => {
    const diags = await diagnosticsOf("lv8-orchestrate", "orchestrate-boundary")
    expect(diags.some((d) => d.message.includes("imports domains/"))).toBe(false)
  })
})
