import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import { formatLevel } from "../../src/cli/formatters/console.js"
import type { KaachanConfig } from "../../src/types/config.js"

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

describe("analyze", () => {
  it("returns error for non-existent directory", async () => {
    const result = await analyze(makeConfig("/does/not/exist/kaachan-test"))
    expect(result.ok).toBe(false)
  })

  it("detects Lv1 from lv1 fixture", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv1")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.level).toBe(1)
  })

  it("detects Lv5 from lv5 fixture", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.level).toBe(5)
  })

  it("returns empty diagnostics for lv5 fixture without violations", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5-with-test")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.diagnostics).toHaveLength(0)
  })

  it("includes levelEvidence and missingForNext", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv1")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.levelEvidence.length).toBeGreaterThan(0)
    expect(result.value.missingForNext.length).toBeGreaterThan(0)
  })
})

describe("formatLevel", () => {
  it("renders level header", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const output = formatLevel(result.value)
    expect(output).toContain("Architecture Level: Lv5")
  })

  it("renders evidence lines", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv3")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const output = formatLevel(result.value)
    expect(output).toContain("✓ route.ts")
    expect(output).toContain("✓ parse.ts")
  })

  it("renders missingForNext for non-Lv10", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv1")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const output = formatLevel(result.value)
    expect(output).toContain("Missing for Lv2:")
    expect(output).toContain("workflow.ts")
  })

  it("renders not-detected output", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "no-level")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const output = formatLevel(result.value)
    expect(output).toContain("No Slime Architecture level detected")
    expect(output).toContain("Missing for Lv1:")
    expect(output).toContain("route.ts")
  })
})

describe("analyze — level detection by layout", () => {
  it("reports no level and runs no rules without route.ts or a domain structure", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "no-level")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.level).toBeNull()
    expect(result.value.diagnostics).toHaveLength(0)
  })

  it("detects Lv6 from a domain structure with no flat layer files", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-domains-only")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.level).toBe(6)
    expect(result.value.missingForNext).toEqual(["orchestrate/<name>/"])
  })

  it("detects Lv10 when ports.ts lives in command/ and query/", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv10-cqrs-ports")))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.level).toBe(10)
  })
})
