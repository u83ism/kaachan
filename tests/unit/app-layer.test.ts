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

describe("app-layer rule — app/repository.ts", () => {
  it("emits warning when app/repository.ts exists", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.message).toContain("app/repository.ts")
  })

  it("emits no warning when app/repository.ts does not exist", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.severity === "warning",
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
      (d) => d.ruleId === "app-layer" && d.severity === "error",
    )
    expect(errors.some((d) => d.message.includes("app/client.ts"))).toBe(true)
  })

  it("emits no error when app/client.ts does not exist", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter((d) => d.ruleId === "app-layer")
    expect(errors).toHaveLength(0)
  })
})

describe("app-layer rule — app/logic.ts (Lv7 escalation)", () => {
  it("does NOT emit error for app/logic.ts at Lv6 (no cross- folder)", async () => {
    // lv6-app-violations has no cross- folder → Lv6, app/logic.ts check inactive
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const appLogicErrors = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.message.includes("app/logic.ts"),
    )
    expect(appLogicErrors).toHaveLength(0)
  })

  it("emits error for app/logic.ts at Lv7+", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.message.includes("app/logic.ts"),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]?.severity).toBe("error")
  })

  it("does not activate at Lv5 (no app/ folder)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv5")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "app-layer")
    expect(diagnostics).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv6-app-violations"), { disabledRules: ["app-layer"] }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diagnostics = result.value.diagnostics.filter((d) => d.ruleId === "app-layer")
    expect(diagnostics).toHaveLength(0)
  })
})

describe("app-layer rule — app/repository.ts Lv7 escalation", () => {
  it("emits error (not warning) for app/repository.ts at Lv7+", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-repo-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.message.includes("app/repository.ts"),
    )
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("error")
  })

  it("still emits warning for app/repository.ts at Lv6", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv6-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.message.includes("app/repository.ts"),
    )
    expect(diags).toHaveLength(1)
    expect(diags[0]?.severity).toBe("warning")
  })
})

describe("app-layer rule — cross-*/app/ imports at Lv7+", () => {
  it("emits error when a cross- folder file imports from app/", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-cross-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.message.includes("cross-order/"),
    )
    expect(errors).toHaveLength(1)
    expect(errors[0]?.severity).toBe("error")
    expect(errors[0]?.message).toContain("app/")
  })

  it("does not flag cross-* imports from non-app paths", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-app-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    // lv7-app-violations cross-order/index.ts has no imports from app/
    const crossAppErrors = result.value.diagnostics.filter(
      (d) => d.ruleId === "app-layer" && d.message.includes("cross-") && d.message.includes("app/"),
    )
    expect(crossAppErrors).toHaveLength(0)
  })
})
