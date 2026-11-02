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

describe("workflow-http rule", () => {
  it("warns when a workflow imports an HTTP framework or takes an HTTP context", async () => {
    const diags = (await diagnosticsOf("lv4-store-queries", "workflow-http")).filter(
      (d) => d.ruleId === "workflow-http-access",
    )
    expect(diags).toHaveLength(2)
    expect(diags.every((d) => d.severity === "warning")).toBe(true)
    expect(diags[0]?.message).toContain('"hono"')
    expect(diags[1]?.message).toContain("RawUserWorkflow()")
    expect(diags[1]?.message).toContain("c: Context")
  })

  it("hints when a workflow calls a parse function", async () => {
    const diags = (await diagnosticsOf("lv4-store-queries", "workflow-http")).filter(
      (d) => d.ruleId === "workflow-calls-parse",
    )
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("hint")
    expect(diags[0]?.message).toContain("parseCreateUser()")
  })

  it("does not flag type-only use of parse types", async () => {
    const diags = await diagnosticsOf("lv4-store-queries", "workflow-http")
    expect(diags.some((d) => d.message.includes("CreateUserInput"))).toBe(false)
  })

  it("is not active below Lv3", async () => {
    expect(await diagnosticsOf("lv2", "workflow-http")).toHaveLength(0)
  })
})
