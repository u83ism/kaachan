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

describe("events-validation rule — class type detection", () => {
  it("emits error when events.ts interface property references a user-defined class", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "events-validation" && d.severity === "error",
    )
    expect(errors.length).toBeGreaterThanOrEqual(1)
    // UserCreatedEvent.entity is a class type
    expect(errors.some((d) => d.message.includes("UserCreatedEvent"))).toBe(true)
    expect(errors.some((d) => d.message.includes("entity"))).toBe(true)
  })

  it("emits error when events.ts interface property uses Date (known class-like type)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "events-validation" && d.severity === "error",
    )
    expect(errors.some((d) => d.message.includes("OrderCompletedEvent"))).toBe(true)
    expect(errors.some((d) => d.message.includes("completedAt"))).toBe(true)
  })

  it("does not flag interfaces with no class type properties in clean fixture", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-clean")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "events-validation" && d.severity === "error",
    )
    expect(errors).toHaveLength(0)
  })
})

describe("events-validation rule — discriminant field detection", () => {
  it("emits warning when interface lacks type discriminant", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "events-validation" && d.severity === "warning",
    )
    expect(warnings.length).toBeGreaterThanOrEqual(1)
    expect(warnings.some((d) => d.message.includes("UserCreatedEvent"))).toBe(true)
  })

  it("emits warning when type alias lacks type discriminant", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "events-validation" && d.severity === "warning",
    )
    expect(warnings.some((d) => d.message.includes("PaymentProcessedEvent"))).toBe(true)
  })

  it("does not flag interfaces with type discriminant in clean fixture", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-clean")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const warnings = result.value.diagnostics.filter(
      (d) => d.ruleId === "events-validation" && d.severity === "warning",
    )
    expect(warnings).toHaveLength(0)
  })
})

describe("events-validation rule — activation", () => {
  it("does not activate at Lv7 (no shared/events.ts)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv7-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "events-validation")
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv8-violations"), {
        disabledRules: ["events-validation"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter((d) => d.ruleId === "events-validation")
    expect(diags).toHaveLength(0)
  })
})
