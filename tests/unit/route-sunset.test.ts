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

describe("route-sunset rule", () => {
  it("warns at a route whose sunset date has passed", async () => {
    const diags = await diagnosticsOf("lv6-structure", "route-sunset")
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("warning")
    expect(diags[0]?.message).toBe("a route's sunset date 2026-09-01 has passed (today is 2026-11-02)")
    expect(diags[0]?.location.line).toBe(6)
  })

  it("compares against the configured date", async () => {
    const result = await analyze({ ...makeConfig(join(fixturesDir, "lv6-structure")), today: "2027-02-01" })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.diagnostics.filter((d) => d.ruleId === "route-sunset-passed")).toHaveLength(2)
  })
})
