import { describe, it, expect } from "vitest"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { dirname } from "node:path"
import { scanProject } from "../../src/core/scanner.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const fixturesDir = join(__dirname, "../fixtures")

describe("scanProject", () => {
  it("returns error for non-existent directory", () => {
    const result = scanProject("/does/not/exist/kaachan-test-fixture")
    expect(result.ok).toBe(false)
  })

  describe("lv1 fixture", () => {
    it("detects route.ts", () => {
      const result = scanProject(join(fixturesDir, "lv1"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.hasRoute).toBe(true)
    })

    it("does not detect lv2+ signals", () => {
      const result = scanProject(join(fixturesDir, "lv1"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.hasWorkflow).toBe(false)
      expect(result.value.hasMiddleware).toBe(false)
    })
  })

  describe("lv2 fixture", () => {
    it("detects route, workflow, middleware", () => {
      const result = scanProject(join(fixturesDir, "lv2"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const { value: snap } = result
      expect(snap.hasRoute).toBe(true)
      expect(snap.hasWorkflow).toBe(true)
      expect(snap.hasMiddleware).toBe(true)
    })

    it("does not detect lv3+ signals", () => {
      const result = scanProject(join(fixturesDir, "lv2"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.hasParse).toBe(false)
    })
  })

  describe("lv3 fixture", () => {
    it("detects parse.ts", () => {
      const result = scanProject(join(fixturesDir, "lv3"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.hasParse).toBe(true)
    })
  })

  describe("lv4 fixture", () => {
    it("detects repository.ts and client.ts", () => {
      const result = scanProject(join(fixturesDir, "lv4"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.hasRepository).toBe(true)
      expect(result.value.hasClient).toBe(true)
    })
  })

  describe("lv5 fixture", () => {
    it("detects logic.ts (hasLogic and hasLogicFolder false)", () => {
      const result = scanProject(join(fixturesDir, "lv5"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.hasLogic).toBe(true)
      expect(result.value.hasLogicFolder).toBe(false)
    })
  })

  describe("lv6 fixture", () => {
    it("detects app/, shared/, and domainUser/", () => {
      const result = scanProject(join(fixturesDir, "lv6"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const { value: snap } = result
      expect(snap.hasAppFolder).toBe(true)
      expect(snap.hasSharedFolder).toBe(true)
      expect(snap.domainFolders).toHaveLength(1)
      expect(snap.domainFolders[0]?.name).toBe("domainUser")
    })

    it("domain folder has no special substructure", () => {
      const result = scanProject(join(fixturesDir, "lv6"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const domain = result.value.domainFolders[0]
      expect(domain?.hasPorts).toBe(false)
      expect(domain?.hasCommand).toBe(false)
      expect(domain?.hasQuery).toBe(false)
    })

    it("has no cross- folders or shared events", () => {
      const result = scanProject(join(fixturesDir, "lv6"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.crossFolders).toHaveLength(0)
      expect(result.value.hasSharedEvents).toBe(false)
    })
  })

  describe("sourceFiles collection", () => {
    it("collects .ts files from lv1", () => {
      const result = scanProject(join(fixturesDir, "lv1"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.sourceFiles.length).toBeGreaterThan(0)
      expect(result.value.sourceFiles.every((f) => f.absolutePath.endsWith(".ts"))).toBe(true)
    })

    it("sourceRoot defaults to rootDir when no src/ directory", () => {
      const result = scanProject(join(fixturesDir, "lv1"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.sourceRoot).toBe(result.value.rootDir)
    })
  })
})
