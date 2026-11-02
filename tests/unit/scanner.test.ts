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
    it("detects store.ts and client.ts", () => {
      const result = scanProject(join(fixturesDir, "lv4"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.hasStore).toBe(true)
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
    it("detects app/, shared/, and domains/user/", () => {
      const result = scanProject(join(fixturesDir, "lv6"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const { value: snap } = result
      expect(snap.hasAppFolder).toBe(true)
      expect(snap.hasSharedFolder).toBe(true)
      expect(snap.domainFolders).toHaveLength(1)
      expect(snap.domainFolders[0]?.name).toBe("user")
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

    it("has no orchestrate/ folders or shared events", () => {
      const result = scanProject(join(fixturesDir, "lv6"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.orchestrateFolders).toHaveLength(0)
      expect(result.value.hasSharedEvents).toBe(false)
    })
  })

  describe("lv10 fixture", () => {
    it("treats ports.ts in command/ or query/ as the domain's ports", () => {
      const result = scanProject(join(fixturesDir, "lv10-cqrs-ports"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const domain = result.value.domainFolders[0]
      expect(domain?.name).toBe("user")
      expect(domain?.hasPorts).toBe(true)
      expect(domain?.hasCommand).toBe(true)
      expect(domain?.hasQuery).toBe(true)
    })

    it("collects workflow.ts from command/ and coordinators", () => {
      const result = scanProject(join(fixturesDir, "lv10-cqrs-ports"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const root = join(fixturesDir, "lv10-cqrs-ports")
      expect(result.value.layerFiles.workflow).toEqual([
        join(root, "domains", "user", "command", "workflow.ts"),
        join(root, "orchestrate", "order-inventory", "workflow.ts"),
      ])
    })
  })

  describe("lv7 fixture", () => {
    it("detects coordinators under orchestrate/", () => {
      const result = scanProject(join(fixturesDir, "lv7-violations"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const coordinators = result.value.orchestrateFolders
      expect(coordinators.map((o) => o.name)).toEqual(["order"])
      expect(coordinators[0]?.absolutePath).toBe(join(fixturesDir, "lv7-violations", "orchestrate", "order"))
    })
  })

  describe("layerFiles collection", () => {
    it("collects flat layer files from the source root", () => {
      const result = scanProject(join(fixturesDir, "lv5"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const root = join(fixturesDir, "lv5")
      expect(result.value.layerFiles.store).toEqual([join(root, "store.ts")])
      expect(result.value.layerFiles.logic).toEqual([join(root, "logic.ts")])
    })

    it("collects logic/ folder files", () => {
      const result = scanProject(join(fixturesDir, "lv5-violations-folder"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const logicDir = join(fixturesDir, "lv5-violations-folder", "logic")
      expect(result.value.layerFiles.logic).toContain(join(logicDir, "user.ts"))
    })

    it("collects layer files from each domain", () => {
      const result = scanProject(join(fixturesDir, "lv6-domain-with-routes"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      const domainsDir = join(fixturesDir, "lv6-domain-with-routes", "domains")
      expect(result.value.layerFiles.workflow).toEqual(
        expect.arrayContaining([join(domainsDir, "order", "workflow.ts"), join(domainsDir, "user", "workflow.ts")]),
      )
    })

    it("collects app/store.ts", () => {
      const result = scanProject(join(fixturesDir, "lv6-app-violations"))
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.value.layerFiles.store).toContain(join(fixturesDir, "lv6-app-violations", "app", "store.ts"))
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
