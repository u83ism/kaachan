import { describe, it, expect } from "vitest"
import { LEVEL_DEFINITIONS } from "@u83ism/architecture-rules"
import { detectLevel, REQUIREMENT_CHECKS } from "../../src/level/detector.js"
import type { DomainFolder, ProjectSnapshot } from "../../src/types/analysis.js"

const base: ProjectSnapshot = {
  rootDir: "/project",
  sourceRoot: "/project",
  hasRoute: false,
  hasWorkflow: false,
  hasMiddleware: false,
  hasParse: false,
  hasStore: false,
  hasClient: false,
  hasLogic: false,
  hasLogicFolder: false,
  logicFolderFiles: [],
  hasParseFolder: false,
  parseFolderFiles: [],
  hasAppFolder: false,
  hasSharedFolder: false,
  hasInfrastructureFolder: false,
  orchestrateFolders: [],
  hasSharedEvents: false,
  domainFolders: [],
  layerFiles: { store: [], workflow: [], parse: [], logic: [] },
  sourceFiles: [],
}

const userDomain = (overrides: Partial<DomainFolder> = {}): DomainFolder => ({
  name: "user",
  absolutePath: "/project/domains/user",
  hasPorts: false,
  hasCommand: false,
  hasQuery: false,
  ...overrides,
})

const lv1: ProjectSnapshot = { ...base, hasRoute: true }

const lv2: ProjectSnapshot = { ...lv1, hasWorkflow: true, hasMiddleware: true }

const lv3: ProjectSnapshot = { ...lv2, hasParse: true }

const lv4: ProjectSnapshot = { ...lv3, hasStore: true, hasClient: true }

const lv5: ProjectSnapshot = { ...lv4, hasLogic: true }

// From Lv6 the layer files live in app/, shared/ and domains/ — nothing flat in the source root
const lv6: ProjectSnapshot = {
  ...base,
  hasAppFolder: true,
  hasSharedFolder: true,
  domainFolders: [userDomain()],
}

const lv7: ProjectSnapshot = {
  ...lv6,
  orchestrateFolders: [{ name: "order-inventory", absolutePath: "/project/orchestrate/order-inventory" }],
}

const lv8: ProjectSnapshot = { ...lv7, hasSharedEvents: true }

const lv9: ProjectSnapshot = {
  ...lv8,
  hasInfrastructureFolder: true,
  domainFolders: [userDomain({ hasPorts: true })],
}

const lv10: ProjectSnapshot = {
  ...lv9,
  domainFolders: [userDomain({ hasPorts: true, hasCommand: true, hasQuery: true })],
}

describe("detectLevel", () => {
  it("returns Lv1 for route.ts only", () => {
    const result = detectLevel(lv1)
    expect(result.level).toBe(1)
  })

  it("returns no level when there are no signals", () => {
    const result = detectLevel(base)
    expect(result.level).toBeNull()
    expect(result.evidence).toHaveLength(0)
    expect(result.missingForNext).toEqual(["route.ts"])
  })

  it("returns Lv2", () => {
    expect(detectLevel(lv2).level).toBe(2)
  })

  it("returns Lv3", () => {
    expect(detectLevel(lv3).level).toBe(3)
  })

  it("returns Lv4", () => {
    expect(detectLevel(lv4).level).toBe(4)
  })

  it("returns Lv5", () => {
    expect(detectLevel(lv5).level).toBe(5)
  })

  it("returns Lv6", () => {
    expect(detectLevel(lv6).level).toBe(6)
  })

  it("returns Lv6 when the flat Lv1–5 files are still in the source root", () => {
    const snap: ProjectSnapshot = { ...lv5, hasAppFolder: true, hasSharedFolder: true, domainFolders: [userDomain()] }
    expect(detectLevel(snap).level).toBe(6)
  })

  it("returns Lv7", () => {
    expect(detectLevel(lv7).level).toBe(7)
  })

  it("returns Lv8", () => {
    expect(detectLevel(lv8).level).toBe(8)
  })

  it("returns Lv9", () => {
    expect(detectLevel(lv9).level).toBe(9)
  })

  it("returns Lv10", () => {
    expect(detectLevel(lv10).level).toBe(10)
  })

  it("cascade: missing middleware prevents Lv2", () => {
    const snap: ProjectSnapshot = { ...lv1, hasWorkflow: true }
    expect(detectLevel(snap).level).toBe(1)
  })

  it("cascade: missing parse prevents Lv3 even with all lv2 signals", () => {
    expect(detectLevel(lv2).level).toBe(2)
  })

  it("cascade: lv5 via logic/ folder (hasLogicFolder true)", () => {
    const snap: ProjectSnapshot = { ...lv4, hasLogic: true, hasLogicFolder: true }
    expect(detectLevel(snap).level).toBe(5)
  })

  it("cascade: domain structure without orchestrate/ stays at Lv6 even with shared/events.ts", () => {
    const snap: ProjectSnapshot = { ...lv6, hasSharedEvents: true }
    expect(detectLevel(snap).level).toBe(6)
  })

  it("domains/ without app/ and shared/ is not a domain structure", () => {
    const snap: ProjectSnapshot = { ...lv5, domainFolders: [userDomain()] }
    expect(detectLevel(snap).level).toBe(5)
  })

  describe("evidence", () => {
    it("includes all signals up to detected level", () => {
      const result = detectLevel(lv3)
      expect(result.evidence).toContain("route.ts")
      expect(result.evidence).toContain("workflow.ts, middleware.ts")
      expect(result.evidence).toContain("parse.ts")
      expect(result.evidence).not.toContain("store.ts, client.ts")
    })

    it("starts from the domain structure from Lv6", () => {
      const result = detectLevel(lv7)
      expect(result.evidence).toEqual(["app/, shared/, domains/", "folder under orchestrate/"])
    })
  })

  describe("missingForNext", () => {
    it("Lv1 → Lv2: lists workflow.ts and middleware.ts", () => {
      const result = detectLevel(lv1)
      expect(result.missingForNext).toContain("workflow.ts")
      expect(result.missingForNext).toContain("middleware.ts")
    })

    it("Lv1 with workflow only: lists only middleware.ts", () => {
      const snap: ProjectSnapshot = { ...lv1, hasWorkflow: true }
      const result = detectLevel(snap)
      expect(result.missingForNext).not.toContain("workflow.ts")
      expect(result.missingForNext).toContain("middleware.ts")
    })

    it("Lv5 → Lv6: lists only the missing folders", () => {
      const snap: ProjectSnapshot = { ...lv5, hasAppFolder: true }
      expect(detectLevel(snap).missingForNext).toEqual(["shared/", "domains/<name>/"])
    })

    it("Lv6 → Lv7: lists orchestrate/<name>/", () => {
      expect(detectLevel(lv6).missingForNext).toEqual(["orchestrate/<name>/"])
    })

    it("Lv10 has no missingForNext", () => {
      const result = detectLevel(lv10)
      expect(result.missingForNext).toHaveLength(0)
    })
  })

  it("has a check for every requirement label in LEVEL_DEFINITIONS", () => {
    const labels = LEVEL_DEFINITIONS.flatMap((d) => [...d.requiredFilesForNext, ...d.requiredFoldersForNext])
    const unchecked = labels.filter((label) => REQUIREMENT_CHECKS[label] === undefined)
    expect(unchecked).toEqual([])
  })
})
