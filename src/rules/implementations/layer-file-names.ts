import { relative, sep } from "node:path"
import { LAYER_FILE_TYPO_DISTANCE, RECOGNIZED_FILES } from "@u83ism/architecture-rules"
import type { Finding } from "../../types/diagnostic.js"
import type { SourceFileInfo } from "../../types/analysis.js"
import type { Rule, RuleContext } from "../../types/rule.js"
import { damerauLevenshtein } from "../../analysis/edit-distance.js"

const RULE_IDS = [
  "layer-file-typo",
  "layer-file-unknown",
] as const
type Id = (typeof RULE_IDS)[number]

const TS_EXTENSION = ".ts"
const TEST_SUFFIX = /\.(test|spec)$/
/** Type declarations and tool configs (e.g. vitest.config.ts when there is no src/) are not layer files */
const NOT_LAYER_FILE = /\.(d|config)\.ts$/

/** What each recognized name holds, to point a file with an unknown name at its layer */
const LAYER_ROLES: Readonly<Record<string, string>> = {
  "route.ts": "HTTP input/output",
  "routes.ts": "HTTP input/output",
  "middleware.ts": "request preprocessing",
  "workflow.ts": "the steps of a use case",
  "parse.ts": "input validation",
  "errors.ts": "error definitions",
  "store.ts": "database access",
  "client.ts": "external API calls",
  "adapter.ts": "translation between external and domain vocabulary",
  "logic.ts": "pure business rules",
  "ports.ts": "interfaces the domain depends on",
  "utility.ts": "pure utility functions",
  "smallLogic.ts": "small pure logic not worth a domain",
  "events.ts": "events shared across domains",
  "index.ts": "the server entry point",
  "main.ts": "the server entry point",
  "server.ts": "the server entry point",
}

interface PlacedFile {
  readonly file: SourceFileInfo
  /** Folder relative to the source root, `/`-separated ("" for the source root itself) */
  readonly dir: string
  readonly fileName: string
}

interface Candidate {
  readonly name: string
  readonly distance: number
}

const toPlacedFile = (sourceRoot: string, file: SourceFileInfo): PlacedFile | undefined => {
  const segments = relative(sourceRoot, file.absolutePath).split(sep)
  const fileName = segments.at(-1)
  return segments[0] === ".." || fileName === undefined
    ? undefined
    : { file, dir: segments.slice(0, -1).join("/"), fileName }
}

const matchesLocation = (pattern: string, dir: string): boolean => {
  const patternSegments = pattern === "" ? [] : pattern.split("/")
  const dirSegments = dir === "" ? [] : dir.split("/")
  return (
    patternSegments.length === dirSegments.length &&
    patternSegments.every((s, i) => s === "*" || s === dirSegments[i])
  )
}

/** Compared without the extension, case, `-` and `_` */
const normalize = (name: string): string =>
  name.replace(/\.ts$/, "").toLowerCase().replace(/[-_]/g, "")

const maxDistance = (recognizedName: string): number =>
  normalize(recognizedName).length <= LAYER_FILE_TYPO_DISTANCE.SHORT_NAME_MAX_LENGTH
    ? LAYER_FILE_TYPO_DISTANCE.SHORT
    : LAYER_FILE_TYPO_DISTANCE.LONG

const closestRecognized = (baseName: string, recognized: readonly string[]): Candidate | undefined =>
  recognized
    .map((name) => ({ name, distance: damerauLevenshtein(normalize(baseName), normalize(name)) }))
    .filter((c) => c.distance <= maxDistance(c.name))
    .reduce<Candidate | undefined>((best, c) => (best === undefined || c.distance < best.distance ? c : best), undefined)

const displayPath = (file: SourceFileInfo): string => file.relativePath.split(sep).join("/")

const locationLabel = (dir: string): string => (dir === "" ? "the source root" : `${dir}/`)

const typoFinding = (placed: PlacedFile, testSuffix: string, recognizedName: string): Finding<Id> => {
  const renamed = recognizedName.replace(/\.ts$/, `${testSuffix}${TS_EXTENSION}`)
  return {
    ruleId: "layer-file-typo",
    message: `${displayPath(placed.file)} looks like a misspelling of ${recognizedName}`,
    location: { filePath: placed.file.absolutePath },
    suggestion: `Rename it to ${renamed}. The Slime FW finds layer files by their exact name, and Kaachan detects the level from them.`,
  }
}

const unknownFinding = (placed: PlacedFile, recognized: readonly string[]): Finding<Id> => {
  const layers = recognized.map((name) => `${name} (${LAYER_ROLES[name] ?? "layer file"})`).join(", ")
  return {
    ruleId: "layer-file-unknown",
    message: `${displayPath(placed.file)} is not a layer file name recognized in ${locationLabel(placed.dir)}`,
    location: { filePath: placed.file.absolutePath },
    suggestion: `Move its code to the layer it belongs to: ${layers}. Freely named files belong in a logic/ or parse/ folder.`,
  }
}

const checkFile = (placed: PlacedFile, recognized: readonly string[]): readonly Finding<Id>[] => {
  const stem = placed.fileName.slice(0, -TS_EXTENSION.length)
  const testSuffix = TEST_SUFFIX.exec(stem)?.[0] ?? ""
  const baseName = `${stem.slice(0, stem.length - testSuffix.length)}${TS_EXTENSION}`
  if (recognized.includes(baseName)) return []
  const candidate = closestRecognized(baseName, recognized)
  if (candidate !== undefined) return [typoFinding(placed, testSuffix, candidate.name)]
  // Test files are only checked for misspellings
  return testSuffix === "" ? [unknownFinding(placed, recognized)] : []
}

const checkPlacedFile = (placed: PlacedFile): readonly Finding<Id>[] =>
  RECOGNIZED_FILES.filter((l) => matchesLocation(l.path, placed.dir)).flatMap((l) => checkFile(placed, l.files))

export const layerFileNamesRule: Rule<Id> = {
  id: "layer-file-names",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { sourceRoot, sourceFiles } = context.snapshot
    return sourceFiles
      .filter((f) => f.absolutePath.endsWith(TS_EXTENSION) && !NOT_LAYER_FILE.test(f.absolutePath))
      .map((f) => toPlacedFile(sourceRoot, f))
      .filter((p): p is PlacedFile => p !== undefined)
      .flatMap(checkPlacedFile)
  },
}
