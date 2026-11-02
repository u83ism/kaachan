import { join, relative, sep } from "node:path"
import { FOLDER_NAMES } from "@u83ism/architecture-rules"
import { isInsideDir, loadSourceFile, relativeImports } from "../../analysis/layer-modules.js"
import { measureFile } from "../../analysis/line-counter.js"
import type { DomainFolder } from "../../types/analysis.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "domain-pair-coordinated",
  "domain-folder-thin",
] as const
type Id = (typeof RULE_IDS)[number]

/** A domain pair imported together by this many app/ or orchestrate/ files counts as "repeatedly" (decided 2026-11-02) */
const COORDINATED_PAIR_MIN_FILES = 2

/** A domain whose non-test code is shorter than this is "thin" (decided 2026-11-02) */
const THIN_DOMAIN_MAX_LINES = 50

const isTestFile = (filePath: string): boolean => /\.(test|spec)\.ts$/.test(filePath)

const toPosix = (p: string): string => p.split(sep).join("/")

// --- Check 1: the same domain pair coordinated in several files ---

/** Domains a file imports, sorted by name */
const importedDomains = (context: RuleContext, filePath: string): readonly string[] => {
  const imports = relativeImports(loadSourceFile(context.morphProject, filePath), filePath)
  return context.snapshot.domainFolders
    .filter((d) => imports.some((i) => isInsideDir(i.resolved, d.absolutePath)))
    .map((d) => d.name)
    .sort()
}

const pairsOf = (domains: readonly string[]): readonly string[] =>
  domains.flatMap((a, i) => domains.slice(i + 1).map((b) => `${a}+${b}`))

const checkCoordinatedPairs = (context: RuleContext): readonly Finding<Id>[] => {
  const { orchestrateFolders, sourceFiles, sourceRoot } = context.snapshot
  const coordinatorDirs = [join(sourceRoot, FOLDER_NAMES.APP), ...orchestrateFolders.map((o) => o.absolutePath)]
  const coordinatorFiles = sourceFiles
    .map((f) => f.absolutePath)
    .filter((p) => !isTestFile(p) && coordinatorDirs.some((dir) => isInsideDir(p, dir)))

  const filesByPair = coordinatorFiles.reduce<ReadonlyMap<string, readonly string[]>>(
    (acc, filePath) =>
      new Map([
        ...acc,
        ...pairsOf(importedDomains(context, filePath)).map((pair): [string, readonly string[]] => [
          pair,
          [...(acc.get(pair) ?? []), filePath],
        ]),
      ]),
    new Map(),
  )

  return [...filesByPair]
    .filter(([, files]) => files.length >= COORDINATED_PAIR_MIN_FILES)
    .map(([pair, files]) => {
      const [a = "", b = ""] = pair.split("+")
      return {
        ruleId: "domain-pair-coordinated",
        message: `domains/${a} and domains/${b} are called together in ${files.length} app/ or orchestrate/ files`,
        location: { filePath: files[0] ?? sourceRoot },
        details: files.map((f) => toPosix(relative(context.rootDir, f))),
        suggestion: `If ${a} and ${b} keep changing together, consider merging them or redrawing the boundary between them. This is a judgment for a human; Kaachan only reports the pattern.`,
      }
    })
}

// --- Check 2: a domain with very little in it ---

const domainLineCount = (context: RuleContext, domain: DomainFolder): number =>
  context.snapshot.sourceFiles
    .filter((f) => isInsideDir(f.absolutePath, domain.absolutePath) && !isTestFile(f.absolutePath))
    .reduce((sum, f) => {
      const metrics = measureFile(context.morphProject, f.absolutePath)
      return sum + (metrics.ok ? metrics.value.lineCount : 0)
    }, 0)

const checkThinDomain = (context: RuleContext, domain: DomainFolder): readonly Finding<Id>[] => {
  const lines = domainLineCount(context, domain)
  if (lines >= THIN_DOMAIN_MAX_LINES) return []
  return [
    {
      ruleId: "domain-folder-thin",
      message: `domains/${domain.name}/ has only ${lines} lines of code`,
      location: { filePath: domain.absolutePath },
      suggestion:
        "Consider merging it into the domain it works most closely with. Keep it if it is a deliberate upstream domain (e.g. auth) that others depend on.",
    },
  ]
}

export const domainMergeHintsRule: Rule<Id> = {
  id: "domain-merge-hints",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    return [
      ...checkCoordinatedPairs(context),
      ...context.snapshot.domainFolders.flatMap((d) => checkThinDomain(context, d)),
    ]
  },
}
