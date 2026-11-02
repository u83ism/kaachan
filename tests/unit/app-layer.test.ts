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

describe("app-layer rule — app/store.ts", () => {
  it("emits warning when app/store.ts exists", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.severity === "warning",
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toContain("app/store.ts")
  })

  it("emits no warning when app/store.ts does not exist", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.severity === "warning",
    )
    expect(warnings).toHaveLength(0)
  })
})

describe("app-layer rule — app/client.ts", () => {
  it("emits error when app/client.ts exists", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.severity === "error",
    )
    expect(errors.some((d) => d.message.includes("app/client.ts"))).toBe(true)
  })

  it("emits no error when app/client.ts does not exist", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter((d) => isFrom(d, "app-layer"))
    expect(errors).toHaveLength(0)
  })
})

describe("app-layer rule — app/logic.ts (Lv7 escalation)", () => {
  it("does NOT emit error for app/logic.ts at Lv6 (no orchestrate/ folder)", async () => {
    // lv6-app-violations has no orchestrate/ folder → Lv6, app/logic.ts check inactive
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const appLogicErrors = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.message.includes("app/logic.ts"),
    )
    expect(appLogicErrors).toHaveLength(0)
  })

  it("emits error for app/logic.ts at Lv7+", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.message.includes("app/logic.ts"),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]?.severity).toBe("error")
  })

  it("does not activate at Lv5 (no app/ folder)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => isFrom(d, "app-layer"))
    expect(diagnostics).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv6-app-violations"), { disabledRules: ["app-layer"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => isFrom(d, "app-layer"))
    expect(diagnostics).toHaveLength(0)
  })
})

describe("app-layer rule — app/store.ts Lv7 escalation", () => {
  it("emits error (not warning) for app/store.ts at Lv7+", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-repo-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.message.includes("app/store.ts"),
    )
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("error")
  })

  it("still emits warning for app/store.ts at Lv6", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.message.includes("app/store.ts"),
    )
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("warning")
  })
})

describe("app-layer rule — orchestrate/*/ importing app/ at Lv7+", () => {
  it("emits error when an orchestrate/ folder file imports from app/", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-cross-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.message.includes("orchestrate/order/"),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]?.severity).toBe("error")
    expect(errors[0]?.message).toContain("app/")
  })

  it("does not flag orchestrate/* imports from non-app paths", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // lv7-app-violations orchestrate/order/index.ts has no imports from app/
    const crossAppErrors = result.value.diagnostics.filter(
      (d) => isFrom(d, "app-layer") && d.message.includes("orchestrate/") && d.message.includes("app/"),
    )
    expect(crossAppErrors).toHaveLength(0)
  })
})

describe("app-layer rule — App layer size", () => {
  it("warns at an app/ file over the warning threshold", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-structure")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const sizes = result.value.diagnostics.filter((d) => d.ruleId === "app-size")
    expect(sizes).toHaveLength(1)
    expect(sizes[0]?.severity).toBe("warning")
    expect(sizes[0]?.message).toMatch(/app[\\/]workflow\.ts is too large \(512 lines\)/)
  })

  it("leaves app/route.ts to app-route-size", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv6-fat-routing"), {
        thresholds: { hintLines: 1, hintFunctions: 1, warningLines: 1, errorLogicFolderLines: 1 },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const sizes = result.value.diagnostics.filter((d) => d.ruleId === "app-size")
    expect(sizes.some((d) => d.location.filePath.endsWith("route.ts"))).toBe(false)
  })
})
