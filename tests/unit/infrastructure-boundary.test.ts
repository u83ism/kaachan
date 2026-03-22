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

describe("infrastructure-boundary rule — ORM in domain folders", () => {
  it("emits error when a domain file imports ORM directly", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv9-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "infrastructure-boundary" && d.severity === "error",
    )
    expect(errors.length).toBeGreaterThanOrEqual(1)
    // domainUser/service.ts imports @prisma/client
    expect(errors.some((d) => d.message.includes("domainUser"))).toBe(true)
    expect(errors.some((d) => d.message.includes("@prisma/client"))).toBe(true)
  })

  it("does not flag infrastructure/ files that import ORM", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv9-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "infrastructure-boundary" && d.severity === "error",
    )
    // infrastructure/userRepo.ts must NOT be flagged
    expect(errors.every((d) => !d.location.filePath.includes("infrastructure"))).toBe(true)
  })
})

describe("infrastructure-boundary rule — ORM outside infrastructure", () => {
  it("emits error when a non-domain, non-infrastructure file imports ORM", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv9-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const errors = result.value.diagnostics.filter(
      (d) => d.ruleId === "infrastructure-boundary" && d.severity === "error",
    )
    // app/index.ts imports @prisma/client
    expect(errors.some((d) => d.location.filePath.includes("app"))).toBe(true)
  })
})

describe("infrastructure-boundary rule — workflow port acceptance", () => {
  it("emits hint when domain has ports.ts but workflow accepts no port parameters", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv9-violations")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const hints = result.value.diagnostics.filter(
      (d) => d.ruleId === "infrastructure-boundary" && d.severity === "hint",
    )
    expect(hints.length).toBeGreaterThanOrEqual(1)
    expect(hints.some((d) => d.message.includes("domainUser"))).toBe(true)
    expect(hints.some((d) => d.message.includes("ports.ts"))).toBe(true)
  })
})

describe("infrastructure-boundary rule — activation", () => {
  it("does not activate at Lv8 (no infrastructure/ or ports.ts)", async () => {
    const result = await analyze(makeConfig(join(fixturesDir, "lv8-clean")))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => d.ruleId === "infrastructure-boundary",
    )
    expect(diags).toHaveLength(0)
  })

  it("can be disabled via disabledRules", async () => {
    const result = await analyze(
      makeConfig(join(fixturesDir, "lv9-violations"), {
        disabledRules: ["infrastructure-boundary"],
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const diags = result.value.diagnostics.filter(
      (d) => d.ruleId === "infrastructure-boundary",
    )
    expect(diags).toHaveLength(0)
  })
})
