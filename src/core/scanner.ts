import { readdirSync, existsSync } from "node:fs"
import { join, relative } from "node:path"
import { LAYER_FILES, FOLDER_NAMES, SHARED_EVENTS_FILE } from "@u83ism/architecture-rules"
import type {
  DomainFolder,
  LayerFiles,
  OrchestrateFolder,
  ProjectSnapshot,
  SourceFileInfo,
} from "../types/analysis.js"
import type { Result } from "../types/index.js"

type Entries = { readonly files: readonly string[]; readonly dirs: readonly string[] }

const PARSE_FOLDER = "parse"

const listEntries = (dir: string): Entries => {
  try {
    const entries = readdirSync(dir, { withFileTypes: true })
    return {
      files: entries.filter((e) => e.isFile()).map((e) => e.name),
      dirs: entries.filter((e) => e.isDirectory()).map((e) => e.name),
    }
  } catch {
    return { files: [], dirs: [] }
  }
}

const collectTsFiles = (dir: string, rootDir: string): readonly SourceFileInfo[] => {
  const { files, dirs } = listEntries(dir)
  const fromFiles: readonly SourceFileInfo[] = files
    .filter((f) => f.endsWith(".ts"))
    .map((f) => {
      const absolutePath = join(dir, f)
      return { absolutePath, relativePath: relative(rootDir, absolutePath) }
    })
  const fromDirs: readonly SourceFileInfo[] = dirs
    .filter((d) => d !== "node_modules" && d !== "dist")
    .flatMap((d) => collectTsFiles(join(dir, d), rootDir))
  return [...fromFiles, ...fromDirs]
}

const listTsFilesIn = (dir: string): readonly string[] =>
  listEntries(dir).files
    .filter((f) => f.endsWith(".ts"))
    .map((f) => join(dir, f))

const listSubfolders = (dir: string): readonly { readonly name: string; readonly absolutePath: string }[] =>
  listEntries(dir).dirs.map((name) => ({ name, absolutePath: join(dir, name) }))

const scanDomainFolder = (name: string, absolutePath: string): DomainFolder => {
  const { files, dirs } = listEntries(absolutePath)
  const hasCommand = dirs.includes(FOLDER_NAMES.COMMAND)
  const hasQuery = dirs.includes(FOLDER_NAMES.QUERY)
  const hasCqrsPorts = [FOLDER_NAMES.COMMAND, FOLDER_NAMES.QUERY].some((sub) =>
    existsSync(join(absolutePath, sub, LAYER_FILES.PORTS)),
  )
  return {
    name,
    absolutePath,
    hasPorts: files.includes(LAYER_FILES.PORTS) || hasCqrsPorts,
    hasCommand,
    hasQuery,
  }
}

/** A layer file in `dir`, plus the files of its promotion folder (e.g. `logic/`) when given */
const findLayerFiles = (
  dir: string,
  fileName: string,
  folderName?: string,
): readonly string[] => {
  const filePath = join(dir, fileName)
  const fromFile = existsSync(filePath) ? [filePath] : []
  const fromFolder = folderName !== undefined ? listTsFilesIn(join(dir, folderName)) : []
  return [...fromFile, ...fromFolder]
}

const collectLayerFiles = (
  sourceRoot: string,
  domainFolders: readonly DomainFolder[],
  orchestrateFolders: readonly OrchestrateFolder[],
): LayerFiles => {
  const domainDirs = domainFolders.flatMap((d) => [
    d.absolutePath,
    join(d.absolutePath, FOLDER_NAMES.COMMAND),
    join(d.absolutePath, FOLDER_NAMES.QUERY),
  ])
  const dirs = [
    sourceRoot,
    join(sourceRoot, FOLDER_NAMES.APP),
    join(sourceRoot, FOLDER_NAMES.SHARED),
    ...domainDirs,
    ...orchestrateFolders.map((o) => o.absolutePath),
  ]
  return {
    store: dirs.flatMap((d) => findLayerFiles(d, LAYER_FILES.STORE)),
    workflow: dirs.flatMap((d) => findLayerFiles(d, LAYER_FILES.WORKFLOW)),
    parse: dirs.flatMap((d) => findLayerFiles(d, LAYER_FILES.PARSE, PARSE_FOLDER)),
    logic: dirs.flatMap((d) => findLayerFiles(d, LAYER_FILES.LOGIC, FOLDER_NAMES.LOGIC)),
  }
}

export const scanProject = (rootDir: string): Result<ProjectSnapshot> => {
  if (!existsSync(rootDir)) {
    return { ok: false, error: `Directory does not exist: ${rootDir}` }
  }

  const srcPath = join(rootDir, "src")
  const sourceRoot = existsSync(srcPath) ? srcPath : rootDir

  const { files, dirs } = listEntries(sourceRoot)

  const hasLogicFolder = dirs.includes(FOLDER_NAMES.LOGIC)
  const logicFolderFiles = hasLogicFolder ? listTsFilesIn(join(sourceRoot, FOLDER_NAMES.LOGIC)) : []

  const hasParseFolder = dirs.includes(PARSE_FOLDER)
  const parseFolderFiles = hasParseFolder ? listTsFilesIn(join(sourceRoot, PARSE_FOLDER)) : []

  // Every folder under domains/ and orchestrate/ counts, kebab-case or not:
  // the folder-name-not-kebab-case rule reports the names, level detection does not depend on them.
  const domainFolders = listSubfolders(join(sourceRoot, FOLDER_NAMES.DOMAINS)).map((d) =>
    scanDomainFolder(d.name, d.absolutePath),
  )
  const orchestrateFolders = listSubfolders(join(sourceRoot, FOLDER_NAMES.ORCHESTRATE))

  const sharedPath = join(sourceRoot, FOLDER_NAMES.SHARED)
  const hasSharedEvents = existsSync(join(sharedPath, SHARED_EVENTS_FILE))

  return {
    ok: true,
    value: {
      rootDir,
      sourceRoot,
      hasRoute: files.includes(LAYER_FILES.ROUTE),
      hasWorkflow: files.includes(LAYER_FILES.WORKFLOW),
      hasMiddleware: files.includes(LAYER_FILES.MIDDLEWARE),
      hasParse: files.includes(LAYER_FILES.PARSE) || hasParseFolder,
      hasParseFolder,
      parseFolderFiles,
      hasStore: files.includes(LAYER_FILES.STORE),
      hasClient: files.includes(LAYER_FILES.CLIENT),
      hasLogic: files.includes(LAYER_FILES.LOGIC) || hasLogicFolder,
      hasLogicFolder,
      logicFolderFiles,
      hasAppFolder: dirs.includes(FOLDER_NAMES.APP),
      hasSharedFolder: dirs.includes(FOLDER_NAMES.SHARED),
      hasInfrastructureFolder: dirs.includes(FOLDER_NAMES.INFRASTRUCTURE),
      orchestrateFolders,
      hasSharedEvents,
      domainFolders,
      layerFiles: collectLayerFiles(sourceRoot, domainFolders, orchestrateFolders),
      sourceFiles: collectTsFiles(rootDir, rootDir),
    },
  }
}
