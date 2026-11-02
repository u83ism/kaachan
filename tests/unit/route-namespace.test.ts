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

describe("route-namespace rule", () => {
  it("hints at API routes defined outside an /api group", async () => {
    const diags = await diagnosticsOf("lv4-store-queries", "route-namespace")
    expect(diags.map((d) => d.message)).toEqual(['route.ts defines "/orders" outside an /api group'])
    expect(diags[0]?.severity).toBe("hint")
  })

  it("does not flag routes in an /api group, /api paths or infrastructure routes such as /health", async () => {
    const diags = await diagnosticsOf("lv4-store-queries", "route-namespace")
    const messages = diags.map((d) => d.message).join("\n")
    expect(messages).not.toContain("/users")
    expect(messages).not.toContain("/api/payments")
    expect(messages).not.toContain("/health")
  })
})
