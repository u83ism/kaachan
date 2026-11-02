import type { DomainDependencies, TableOwnership } from "@u83ism/architecture-rules"

export interface SourceFileInfo {
  readonly absolutePath: string
  readonly relativePath: string
}

/** A folder directly under `domains/` (Lv6+), e.g. `domains/user` */
export interface DomainFolder {
  readonly name: string
  readonly absolutePath: string
  /** `ports.ts` directly in the domain, or in its `command/` / `query/` (Lv10) */
  readonly hasPorts: boolean
  readonly hasCommand: boolean
  readonly hasQuery: boolean
}

/** A coordinator folder directly under `orchestrate/` (Lv7+), e.g. `orchestrate/order-inventory` */
export interface OrchestrateFolder {
  readonly name: string
  readonly absolutePath: string
}

/**
 * Absolute paths of each layer file wherever it lives: the source root (Lv1–5),
 * `app/`, `shared/`, each domain (and its `command/` / `query/`) and each coordinator.
 * `logic` and `parse` also include the files of `logic/` and `parse/` folders.
 */
export interface LayerFiles {
  readonly store: readonly string[]
  readonly workflow: readonly string[]
  readonly parse: readonly string[]
  readonly logic: readonly string[]
}

/**
 * The declarations Kaachan reads from `slime.config.ts`.
 * `domains` / `tables` are undefined when the file does not declare them.
 */
export type SlimeConfig =
  | { readonly kind: "missing" }
  | {
      readonly kind: "found"
      readonly filePath: string
      readonly domains: DomainDependencies | undefined
      readonly tables: TableOwnership | undefined
    }

export interface ProjectSnapshot {
  readonly rootDir: string
  readonly sourceRoot: string
  readonly hasRoute: boolean
  readonly hasWorkflow: boolean
  readonly hasMiddleware: boolean
  readonly hasParse: boolean
  readonly hasStore: boolean
  readonly hasClient: boolean
  readonly hasLogic: boolean
  readonly hasLogicFolder: boolean
  readonly logicFolderFiles: readonly string[]
  readonly hasParseFolder: boolean
  readonly parseFolderFiles: readonly string[]
  readonly hasAppFolder: boolean
  readonly hasSharedFolder: boolean
  readonly hasInfrastructureFolder: boolean
  readonly orchestrateFolders: readonly OrchestrateFolder[]
  readonly hasSharedEvents: boolean
  readonly domainFolders: readonly DomainFolder[]
  readonly layerFiles: LayerFiles
  readonly sourceFiles: readonly SourceFileInfo[]
}
