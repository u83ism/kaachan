import { readdirSync, existsSync } from "node:fs"
import { join, relative } from "node:path"
import type { DomainFolder, ProjectSnapshot, SourceFileInfo } from "../types/analysis.js"
import type { Result } from "../types/index.js"

const DOMAIN_FOLDER_PATTERN = /^domain[A-Z]/

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
    hasPorts: files.includes("ports.ts"),
    hasCommand: dirs.includes("command"),
    hasQuery: dirs.includes("query"),
  }
}

export const scanProject = (rootDir: string): Result<ProjectSnapshot> => {
  if (!existsSync(rootDir)) {
    return { ok: false, error: `Directory does not exist: ${rootDir}` }
  }

  const srcPath = join(rootDir, "src")
  const sourceRoot = existsSync(srcPath) ? srcPath : rootDir

  const { files, dirs } = listEntries(sourceRoot)

  const hasLogicFolder = dirs.includes("logic")
  const crossFolders = dirs.filter((d) => d.startsWith("cross-"))
  const domainFolders = dirs
    .filter((d) => DOMAIN_FOLDER_PATTERN.test(d))
    .map((name) => scanDomainFolder(join(sourceRoot, name), name))

  const sharedPath = join(sourceRoot, "shared")
  const hasSharedEvents = existsSync(join(sharedPath, "events.ts"))

  return {
    ok: true,
    value: {
      rootDir,
      sourceRoot,
      hasRoute: files.includes("route.ts"),
      hasWorkflow: files.includes("workflow.ts"),
      hasMiddleware: files.includes("middleware.ts"),
      hasParse: files.includes("parse.ts"),
      hasRepository: files.includes("repository.ts"),
      hasClient: files.includes("client.ts"),
      hasLogic: files.includes("logic.ts") || hasLogicFolder,
      hasLogicFolder,
      hasAppFolder: dirs.includes("app"),
      hasSharedFolder: dirs.includes("shared"),
      hasInfrastructureFolder: dirs.includes("infrastructure"),
      crossFolders,
      hasSharedEvents,
      domainFolders,
      sourceFiles: collectTsFiles(rootDir, rootDir),
    },
  }
}
