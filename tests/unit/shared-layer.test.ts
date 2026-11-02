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

describe("shared-layer rule", () => {
  it("reports I/O imports, I/O calls and module state in shared/utility.ts as errors", async () => {
    const diags = (await diagnosticsOf("lv6-structure", "shared-layer")).filter(
      (d) => d.ruleId === "shared-side-effects",
    )
    expect(diags.map((d) => d.message)).toEqual([
      'shared/utility.ts imports "node:fs" — it must hold pure functions only',
      "shared/utility.ts calls console.log() — it must hold pure functions only",
      "shared/utility.ts keeps module-level mutable state (let) — it must hold pure functions only",
    ])
    expect(diags.every((d) => d.severity === "error")).toBe(true)
  })

  it("does not report type-only imports or a pure shared/smallLogic.ts", async () => {
    const diags = await diagnosticsOf("lv6-structure", "shared-layer")
    expect(diags.filter((d) => d.ruleId === "shared-side-effects")).toHaveLength(3)
    expect(diags.some((d) => d.message.includes("smallLogic"))).toBe(false)
  })

  it("warns at a shared/ file over the warning threshold", async () => {
    const diags = (await diagnosticsOf("lv6-structure", "shared-layer")).filter((d) => d.ruleId === "shared-size")
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("warning")
    expect(diags[0]?.message).toMatch(/shared[\\/]store\.ts is too large \(512 lines\)/)
  })
})
