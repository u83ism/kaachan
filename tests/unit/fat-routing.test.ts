import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { analyze } from "../../src/core/analyzer.js"
import type { KaachanConfig } from "../../src/types/config.js"
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

const fatRoutingFixture = join(fixturesDir, "lv6-fat-routing")

describe("fat-routing rule — URL string literals in app/route.ts", () => {
  it("emits warning when app/route.ts contains URL path string literals", async () => {
    const result = await analyze(makeConfig(fatRoutingFixture))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => isFrom(d, "fat-routing") && d.message.includes("defines routes directly"),
    )
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("warning")
    expect(diags[0]?.details).toContain("/users")
    expect(diags[0]?.details).toContain("/orders")
  })
})

describe("fat-routing rule — dead imports in app/route.ts", () => {
  it("emits warning when app/route.ts imports a non-existent file", async () => {
    const result = await analyze(makeConfig(fatRoutingFixture))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => isFrom(d, "fat-routing") && d.message.includes("does not exist"),
    )
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("warning")
    expect(diags[0]?.message).toContain("non-existent")
  })
})

describe("fat-routing rule — unreachable workflow candidates", () => {
  it("emits hint for domain workflow.ts not imported by any route file", async () => {
    const result = await analyze(makeConfig(fatRoutingFixture))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => isFrom(d, "fat-routing") && d.severity === "hint" && d.message.includes("workflow"),
    )
    // domains/user/workflow.ts is not imported by any route — should be flagged
    expect(hints.some((d) => d.message.includes("domains/user/"))).toBe(true)
    // domains/order/workflow.ts is imported by app/route.ts — should NOT be flagged
    expect(hints.every((d) => !d.message.includes("domains/order/"))).toBe(true)
  })
})

describe("fat-routing rule — app/route.ts size", () => {
  it("emits no growth hint below warningLines (the catalog only has app-route-size)", async () => {
    const result = await analyze(
      makeConfig(fatRoutingFixture, {
        thresholds: { hintLines: 1, hintFunctions: 1, warningLines: 500, errorLogicFolderLines: 300 },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sizeDiagnostics = result.value.diagnostics.filter((d) => d.ruleId === "app-route-size")
    expect(sizeDiagnostics).toHaveLength(0)
  })

  it("emits warning when app/route.ts exceeds warningLines threshold", async () => {
    const result = await analyze(
      makeConfig(fatRoutingFixture, {
        thresholds: { hintLines: 1, hintFunctions: 1, warningLines: 1, errorLogicFolderLines: 300 },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sizeWarnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "fat-routing") && d.message.includes("too large"),
    )
    expect(sizeWarnings.length).toBeGreaterThanOrEqual(1)
    expect(sizeWarnings[0]?.severity).toBe("warning")
  })
})

describe("fat-routing rule — domain co-location (routes.ts)", () => {
  it("emits hint for each domain missing routes.ts", async () => {
    const result = await analyze(makeConfig(fatRoutingFixture))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => isFrom(d, "fat-routing") && d.message.includes("missing routes.ts"),
    )
    // both domains/order and domains/user lack routes.ts
    expect(hints.length).toBeGreaterThanOrEqual(2)
    expect(hints.every((d) => d.severity === "hint")).toBe(true)
  })

  it("emits no co-location hint when all domains have routes.ts", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-domain-with-routes")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => isFrom(d, "fat-routing") && d.message.includes("missing routes.ts"),
    )
    expect(hints).toHaveLength(0)
  })

  it("emits no co-location hint for domain folders that have no workflow.ts", async () => {
    // lv6 fixture has a domain folder (domains/user) with no workflow.ts
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => isFrom(d, "fat-routing") && d.message.includes("missing routes.ts"),
    )
    expect(hints).toHaveLength(0)
  })
})

describe("fat-routing rule — activation", () => {
  it("does not activate at Lv5 (no app/ folder)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => isFrom(d, "fat-routing"))
    expect(diags).toHaveLength(0)
  })

  it("emits no diagnostics when app/route.ts does not exist", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => isFrom(d, "fat-routing"))
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(fatRoutingFixture, { disabledRules: ["fat-routing"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => isFrom(d, "fat-routing"))
    expect(diags).toHaveLength(0)
  })
})
