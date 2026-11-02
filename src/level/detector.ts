import { LAYER_FILES, LEVEL_DEFINITIONS, getLevelDefinition } from "@u83ism/architecture-rules"
import type { ProjectSnapshot } from "../types/analysis.js"
import type { ArchitectureLevel, LevelResult } from "./types.js"

type Requirement = (s: ProjectSnapshot) => boolean

/**
 * How each requirement label in LEVEL_DEFINITIONS (requiredFilesForNext / requiredFoldersForNext)
 * is checked against the snapshot. A label without an entry here is never satisfied,
 * and a unit test checks that every label in the shared package has one.
 */
export const REQUIREMENT_CHECKS: Readonly<Record<string, Requirement>> = {
  "workflow.ts": (s) => s.hasWorkflow,
  "middleware.ts": (s) => s.hasMiddleware,
  "parse.ts": (s) => s.hasParse,
  "store.ts": (s) => s.hasStore,
  "client.ts": (s) => s.hasClient,
  "logic.ts or logic/ folder": (s) => s.hasLogic,
  "app/": (s) => s.hasAppFolder,
  "shared/": (s) => s.hasSharedFolder,
  "domains/<name>/": (s) => s.domainFolders.length >= 1,
  "orchestrate/<name>/": (s) => s.orchestrateFolders.length >= 1,
  "shared/events.ts": (s) => s.hasSharedEvents,
  "ports.ts in domain folder": (s) => s.domainFolders.some((d) => d.hasPorts),
  "infrastructure/": (s) => s.hasInfrastructureFolder,
  "command/ and query/ in domain folder": (s) =>
    s.domainFolders.some((d) => d.hasCommand && d.hasQuery),
}

/**
 * Lv1–5 keep every layer file flat in the source root. From Lv6 the files move into
 * app/, shared/ and domains/, so the domain structure is checked on its own and
 * the flat Lv1–5 files are not required any more.
 */
const DOMAIN_STRUCTURE_LEVEL: ArchitectureLevel = 6

const requirementsForNext = (level: ArchitectureLevel): readonly string[] => {
  const def = getLevelDefinition(level)
  return [...def.requiredFilesForNext, ...def.requiredFoldersForNext]
}

const isSatisfied = (label: string, snapshot: ProjectSnapshot): boolean =>
  REQUIREMENT_CHECKS[label]?.(snapshot) ?? false

const missingRequirements = (level: ArchitectureLevel, snapshot: ProjectSnapshot): readonly string[] =>
  requirementsForNext(level).filter((label) => !isSatisfied(label, snapshot))

const previousLevel = (level: ArchitectureLevel): ArchitectureLevel =>
  (level - 1) as ArchitectureLevel

/** The highest level reached by climbing from `start` while each next level's requirements are met */
const climb = (start: ArchitectureLevel, snapshot: ProjectSnapshot): ArchitectureLevel =>
  LEVEL_DEFINITIONS.filter((d) => d.level > start).reduce<ArchitectureLevel>(
    (reached, def) =>
      reached === previousLevel(def.level) && missingRequirements(reached, snapshot).length === 0
        ? def.level
        : reached,
    start,
  )

const evidenceFrom = (start: ArchitectureLevel, reached: ArchitectureLevel): readonly string[] =>
  LEVEL_DEFINITIONS.filter((d) => d.level >= start && d.level <= reached).map((d) => d.evidenceLabel)

const hasDomainStructure = (snapshot: ProjectSnapshot): boolean =>
  missingRequirements(previousLevel(DOMAIN_STRUCTURE_LEVEL), snapshot).length === 0

const detectFrom = (start: ArchitectureLevel, snapshot: ProjectSnapshot): LevelResult => {
  const reached = climb(start, snapshot)
  return {
    level: reached,
    evidence: evidenceFrom(start, reached),
    missingForNext: missingRequirements(reached, snapshot),
  }
}

export const detectLevel = (snapshot: ProjectSnapshot): LevelResult => {
  if (hasDomainStructure(snapshot)) return detectFrom(DOMAIN_STRUCTURE_LEVEL, snapshot)
  if (snapshot.hasRoute) return detectFrom(1, snapshot)
  return { level: null, evidence: [], missingForNext: [LAYER_FILES.ROUTE] }
}
