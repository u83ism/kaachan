import { describe, it, expect } from "vitest"
import { RULES_TARGETS } from "@u83ism/architecture-rules"
import { TARGET_IDS, loadRulesTemplate, renderRulesFile, selectTargets } from "../../src/cli/export-rules.js"

describe("selectTargets", () => {
  it("selects every target of the shared package when no target is given", () => {
    const result = selectTargets(undefined)
    expect(result.ok && result.value.map((t) => t.id)).toEqual(["claude", "codex", "gemini", "cursor"])
  })

  it("selects the named target", () => {
    const result = selectTargets("cursor")
    expect(result.ok && result.value.map((t) => t.destPath)).toEqual([".cursor/rules/slime.mdc"])
  })

  it("rejects an unknown target and lists the valid ones", () => {
    const result = selectTargets("cline")
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toBe('Unknown target "cline" — expected one of: claude, codex, gemini, cursor')
  })

  it("exposes the target IDs for the CLI help", () => {
    expect(TARGET_IDS).toEqual(RULES_TARGETS.map((t) => t.id))
  })
})

describe("loadRulesTemplate", () => {
  it("reads the shared template of the level", () => {
    const result = loadRulesTemplate(5)
    expect(result.ok).toBe(true)
    expect(result.ok && result.value).toContain("# Slime Architecture Rules — Level 5 (Logic Layer)")
  })

  it("reads a template for every level", () => {
    const levels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const
    expect(levels.filter((level) => !loadRulesTemplate(level).ok)).toEqual([])
  })
})

describe("renderRulesFile", () => {
  const template = "# Rules\n"

  it("writes the template as is for targets without frontmatter", () => {
    const claude = RULES_TARGETS.find((t) => t.id === "claude")
    expect(claude && renderRulesFile(template, claude)).toBe(template)
  })

  it("prepends the frontmatter for Cursor", () => {
    const cursor = RULES_TARGETS.find((t) => t.id === "cursor")
    const content = cursor && renderRulesFile(template, cursor)
    expect(content).toMatch(/^---\n/)
    expect(content).toContain("alwaysApply: true")
    expect(content?.endsWith(template)).toBe(true)
  })
})
