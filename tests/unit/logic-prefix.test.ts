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

describe("logic-prefix rule", () => {
  it("warns at logic functions named without a domain prefix", async () => {
    const diags = await diagnosticsOf("lv5-domain-error", "logic-prefix")
    expect(diags.map((d) => d.message)).toEqual([
      "logic function isAdult() has no domain prefix",
      "logic function canEdit() has no domain prefix",
    ])
    expect(diags.every((d) => d.ruleId === "logic-missing-prefix" && d.severity === "warning")).toBe(true)
  })

  it("accepts domain-first judgments and domain calculations", async () => {
    const diags = await diagnosticsOf("lv5-domain-error", "logic-prefix")
    const messages = diags.map((d) => d.message).join("\n")
    expect(messages).not.toContain("userCanCreate")
    expect(messages).not.toContain("calcOrderTotal")
  })

  it("emits nothing for the clean Lv5 fixture", async () => {
    expect(await diagnosticsOf("lv5-with-test", "logic-prefix")).toHaveLength(0)
  })
})
