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
  today: "2026-11-02",
})

const diagnosticsOf = async (fixture: string, moduleId: string): Promise<readonly Diagnostic[]> => {
  const result = await analyze(makeConfig(join(fixturesDir, fixture)))
  if (!result.ok) throw new Error(result.error)
  return result.value.diagnostics.filter((d) => isFrom(d, moduleId))
}

describe("folder-names rule", () => {
  it("warns at a domain folder that is not kebab-case and suggests the kebab-case name", async () => {
    const diags = await diagnosticsOf("lv6-structure", "folder-names")
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("warning")
    expect(diags[0]?.message).toBe("domains/orderItem/ is not named in kebab-case")
    expect(diags[0]?.suggestion).toContain("domains/order-item/")
  })

  it("emits nothing when every folder is kebab-case", async () => {
    expect(await diagnosticsOf("lv6-declared-deps", "folder-names")).toHaveLength(0)
  })
})
