import { readdirSync, existsSync } from "node:fs"
import { join, relative } from "node:path"
import { FOLDER_PATTERNS, LAYER_FILES, FOLDER_NAMES, SHARED_EVENTS_FILE } from "@u83ism/architecture-rules"
import type { DomainFolder, ProjectSnapshot, SourceFileInfo } from "../types/analysis.js"
import type { Result } from "../types/index.js"

type Entries = { readonly files: readonly string[]; readonly dirs: readonly string[] }

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

const scanDomainFolder = (domainPath: string, name: string): DomainFolder => {
  const { files, dirs } = listEntries(domainPath)
  return {
    name,
    absolutePath: domainPath,
    hasPorts: files.includes(LAYER_FILES.PORTS),
    hasCommand: dirs.includes(FOLDER_NAMES.COMMAND),
    hasQuery: dirs.includes(FOLDER_NAMES.QUERY),
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
  const logicFolderFiles = hasLogicFolder
    ? listEntries(join(sourceRoot, FOLDER_NAMES.LOGIC)).files
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(sourceRoot, FOLDER_NAMES.LOGIC, f))
    : []

  const PARSE_FOLDER = "parse"
  const hasParseFolder = dirs.includes(PARSE_FOLDER)
  const parseFolderFiles = hasParseFolder
    ? listEntries(join(sourceRoot, PARSE_FOLDER)).files
        .filter((f) => f.endsWith(".ts"))
        .map((f) => join(sourceRoot, PARSE_FOLDER, f))
    : []
  const crossFolders = dirs.filter((d) => d.startsWith(FOLDER_PATTERNS.CROSS_PREFIX))
  const domainFolders = dirs
    .filter((d) => FOLDER_PATTERNS.DOMAIN.test(d))
    .map((name) => scanDomainFolder(join(sourceRoot, name), name))

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
      hasRepository: files.includes(LAYER_FILES.REPOSITORY),
      hasClient: files.includes(LAYER_FILES.CLIENT),
      hasLogic: files.includes(LAYER_FILES.LOGIC) || hasLogicFolder,
      hasLogicFolder,
      logicFolderFiles,
      hasAppFolder: dirs.includes(FOLDER_NAMES.APP),
      hasSharedFolder: dirs.includes(FOLDER_NAMES.SHARED),
      hasInfrastructureFolder: dirs.includes(FOLDER_NAMES.INFRASTRUCTURE),
      crossFolders,
      hasSharedEvents,
      domainFolders,
      sourceFiles: collectTsFiles(rootDir, rootDir),
    },
  }
}
