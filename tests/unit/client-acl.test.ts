import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import type { KaachanConfig } from "../../src/types/config.js"

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

describe("client-acl rule", () => {
  it("emits warning when a file outside client/adapter.ts imports client/client.ts directly", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-client-acl-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "client-acl" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.location.filePath).toContain("domainUser")
  })

  it("does not flag client/adapter.ts importing client/client.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-client-acl-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter((d) => d.ruleId === "client-acl")
    // Only domainUser/workflow.ts should be flagged, not adapter.ts
    expect(warnings.every((d) => !d.location.filePath.includes("adapter"))).toBe(true)
  })

  it("emits no diagnostics when no client/ subfolder exists", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "client-acl")
    expect(diagnostics).toHaveLength(0)
  })

  it("does not activate at Lv5", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "client-acl")
    expect(diagnostics).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv6-client-acl-violations"), {
        disabledRules: ["client-acl"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "client-acl")
    expect(diagnostics).toHaveLength(0)
  })
})
