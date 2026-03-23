import { describe, it, expect } from "vitest"
import { generateRulesContent, outputPathForTarget, ALL_TARGETS } from "../../src/cli/export-rules.js"
import type { AnalysisResult } from "../../src/types/config.js"
import type { FatThresholds } from "../../src/types/config.js"

const defaultThresholds: FatThresholds = {
  hintLines: 300,
  hintFunctions: 10,
  warningLines: 500,
  errorLogicFolderLines: 300,
}

const makeResult = (overrides?: Partial<AnalysisResult>): AnalysisResult => ({
  level: 5,
  levelEvidence: ["logic.ts"],
  missingForNext: ["app/ folder", "shared/ folder"],
  diagnostics: [],
  ...overrides,
})

describe("generateRulesContent", () => {
  it("includes the architecture level in the output", () => {
    const content = generateRulesContent(makeResult(), defaultThresholds)
    expect(content).toContain("Lv5")
    expect(content).toContain("Logic Layer")
  })

  it("includes active constraints for the level", () => {
    const content = generateRulesContent(makeResult(), defaultThresholds)
    expect(content).toContain("domain prefix")
    expect(content).toContain("Result type")
  })

  it("mirrors hint threshold exactly from config", () => {
    const customThresholds = { ...defaultThresholds, hintLines: 250, hintFunctions: 8 }
    const content = generateRulesContent(makeResult(), customThresholds)
    expect(content).toContain("250 lines")
    expect(content).toContain("8 functions")
  })

  it("mirrors warning threshold exactly from config", () => {
    const customThresholds = { ...defaultThresholds, warningLines: 600 }
    const content = generateRulesContent(makeResult(), customThresholds)
    expect(content).toContain("600 lines")
  })

  it("includes next level migration guidance", () => {
    const content = generateRulesContent(makeResult(), defaultThresholds)
    expect(content).toContain("Lv6")
    expect(content).toContain("app/ folder")
  })

  it("shows max level message when at Lv10", () => {
    const result = makeResult({ level: 10, missingForNext: [] })
    const content = generateRulesContent(result, defaultThresholds)
    expect(content).toContain("maximum architecture level")
  })

  it("includes level-specific constraints for Lv6", () => {
    const result = makeResult({ level: 6, levelEvidence: ["app/", "shared/", "domain folder"] })
    const content = generateRulesContent(result, defaultThresholds)
    expect(content).toContain("domainXxx/")
    expect(content).toContain("routes.ts")
  })

  it("includes AI guidance section", () => {
    const content = generateRulesContent(makeResult(), defaultThresholds)
    expect(content).toContain("AI Guidance")
  })

  it("includes level evidence in output", () => {
    const result = makeResult({ levelEvidence: ["logic.ts", "parse.ts"] })
    const content = generateRulesContent(result, defaultThresholds)
    expect(content).toContain("logic.ts")
    expect(content).toContain("parse.ts")
  })
})

describe("outputPathForTarget", () => {
  it("returns CLAUDE.md for claude target", () => {
    expect(outputPathForTarget("claude")).toBe("CLAUDE.md")
  })

  it("returns .cursor/rules path for cursor target", () => {
    expect(outputPathForTarget("cursor")).toContain(".cursor")
    expect(outputPathForTarget("cursor")).toContain("slime-architecture.md")
  })

  it("returns .clinerules for cline target", () => {
    expect(outputPathForTarget("cline")).toBe(".clinerules")
  })

  it("returns GEMINI.md for gemini target", () => {
    expect(outputPathForTarget("gemini")).toBe("GEMINI.md")
  })
})

describe("ALL_TARGETS", () => {
  it("includes all four target formats", () => {
    expect(ALL_TARGETS).toContain("claude")
    expect(ALL_TARGETS).toContain("cursor")
    expect(ALL_TARGETS).toContain("cline")
    expect(ALL_TARGETS).toContain("gemini")
    expect(ALL_TARGETS).toHaveLength(4)
  })
})
