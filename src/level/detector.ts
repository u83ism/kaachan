import type { ProjectSnapshot } from "../types/analysis.js"
import type { ArchitectureLevel, LevelResult } from "./types.js"

const meetsLv1 = (s: ProjectSnapshot): boolean => s.hasRoute

const meetsLv2 = (s: ProjectSnapshot): boolean =>
  meetsLv1(s) && s.hasWorkflow && s.hasMiddleware

const meetsLv3 = (s: ProjectSnapshot): boolean => meetsLv2(s) && s.hasParse

const meetsLv4 = (s: ProjectSnapshot): boolean =>
  meetsLv3(s) && s.hasRepository && s.hasClient

const meetsLv5 = (s: ProjectSnapshot): boolean => meetsLv4(s) && s.hasLogic

const meetsLv6 = (s: ProjectSnapshot): boolean =>
  meetsLv5(s) && s.hasAppFolder && s.hasSharedFolder && s.domainFolders.length >= 1

const meetsLv7 = (s: ProjectSnapshot): boolean =>
  meetsLv6(s) && s.crossFolders.length >= 1

const meetsLv8 = (s: ProjectSnapshot): boolean => meetsLv7(s) && s.hasSharedEvents

const meetsLv9 = (s: ProjectSnapshot): boolean =>
  meetsLv8(s) && s.hasInfrastructureFolder && s.domainFolders.some((d) => d.hasPorts)

const meetsLv10 = (s: ProjectSnapshot): boolean =>
  meetsLv9(s) && s.domainFolders.some((d) => d.hasCommand && d.hasQuery)

const missingForLv2 = (s: ProjectSnapshot): readonly string[] => {
  const missing: string[] = []
  if (!s.hasWorkflow) missing.push("workflow.ts")
  if (!s.hasMiddleware) missing.push("middleware.ts")
  return missing
}

const missingForLv3 = (s: ProjectSnapshot): readonly string[] =>
  s.hasParse ? [] : ["parse.ts"]

const missingForLv4 = (s: ProjectSnapshot): readonly string[] => {
  const missing: string[] = []
  if (!s.hasRepository) missing.push("repository.ts")
  if (!s.hasClient) missing.push("client.ts")
  return missing
}

const missingForLv5 = (s: ProjectSnapshot): readonly string[] =>
  s.hasLogic ? [] : ["logic.ts or logic/ folder"]

const missingForLv6 = (s: ProjectSnapshot): readonly string[] => {
  const missing: string[] = []
  if (!s.hasAppFolder) missing.push("app/ folder")
  if (!s.hasSharedFolder) missing.push("shared/ folder")
  if (s.domainFolders.length === 0) missing.push("at least one domain folder (e.g. domainUser/)")
  return missing
}

const missingForLv7 = (s: ProjectSnapshot): readonly string[] =>
  s.crossFolders.length >= 1 ? [] : ["a cross- prefixed folder (e.g. cross-auth/)"]

const missingForLv8 = (s: ProjectSnapshot): readonly string[] =>
  s.hasSharedEvents ? [] : ["shared/events.ts"]

const missingForLv9 = (s: ProjectSnapshot): readonly string[] => {
  const missing: string[] = []
  if (!s.hasInfrastructureFolder) missing.push("infrastructure/ folder")
  if (!s.domainFolders.some((d) => d.hasPorts)) missing.push("ports.ts in at least one domain folder")
  return missing
}

const missingForLv10 = (s: ProjectSnapshot): readonly string[] =>
  s.domainFolders.some((d) => d.hasCommand && d.hasQuery)
    ? []
    : ["command/ and query/ subfolders in at least one domain folder"]

type LevelCheck = {
  readonly level: ArchitectureLevel
  readonly meets: (s: ProjectSnapshot) => boolean
  readonly missingForNext: (s: ProjectSnapshot) => readonly string[]
}

const LEVEL_CHECKS: readonly LevelCheck[] = [
  { level: 1, meets: meetsLv1, missingForNext: missingForLv2 },
  { level: 2, meets: meetsLv2, missingForNext: missingForLv3 },
  { level: 3, meets: meetsLv3, missingForNext: missingForLv4 },
  { level: 4, meets: meetsLv4, missingForNext: missingForLv5 },
  { level: 5, meets: meetsLv5, missingForNext: missingForLv6 },
  { level: 6, meets: meetsLv6, missingForNext: missingForLv7 },
  { level: 7, meets: meetsLv7, missingForNext: missingForLv8 },
  { level: 8, meets: meetsLv8, missingForNext: missingForLv9 },
  { level: 9, meets: meetsLv9, missingForNext: missingForLv10 },
  { level: 10, meets: meetsLv10, missingForNext: () => [] },
] as const

const EVIDENCE_LABELS: Readonly<Record<ArchitectureLevel, string>> = {
  1: "route.ts",
  2: "workflow.ts, middleware.ts",
  3: "parse.ts",
  4: "repository.ts, client.ts",
  5: "logic.ts or logic/",
  6: "app/, shared/, domain folder",
  7: "cross- prefixed folder",
  8: "shared/events.ts",
  9: "infrastructure/, ports.ts in domain",
  10: "command/ and query/ in domain",
}

export const detectLevel = (snapshot: ProjectSnapshot): LevelResult => {
  let reached: ArchitectureLevel = 1

  for (const check of LEVEL_CHECKS) {
    if (check.meets(snapshot)) {
      reached = check.level
    } else {
      break
    }
  }

  const evidence: string[] = []
  for (const check of LEVEL_CHECKS) {
    if (check.level > reached) break
    evidence.push(EVIDENCE_LABELS[check.level])
  }

  const currentCheck = LEVEL_CHECKS.find((c) => c.level === reached)
  const missingForNext = currentCheck ? currentCheck.missingForNext(snapshot) : []

  return { level: reached, evidence, missingForNext }
}
