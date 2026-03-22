export interface SourceFileInfo {
  readonly absolutePath: string
  readonly relativePath: string
}

export interface DomainFolder {
  readonly name: string
  readonly absolutePath: string
  readonly hasPorts: boolean
  readonly hasCommand: boolean
  readonly hasQuery: boolean
}

export interface ProjectSnapshot {
  readonly rootDir: string
  readonly sourceRoot: string
  readonly hasRoute: boolean
  readonly hasWorkflow: boolean
  readonly hasMiddleware: boolean
  readonly hasParse: boolean
  readonly hasRepository: boolean
  readonly hasClient: boolean
  readonly hasLogic: boolean
  readonly hasLogicFolder: boolean
  readonly hasAppFolder: boolean
  readonly hasSharedFolder: boolean
  readonly hasInfrastructureFolder: boolean
  readonly crossFolders: readonly string[]
  readonly hasSharedEvents: boolean
  readonly domainFolders: readonly DomainFolder[]
  readonly sourceFiles: readonly SourceFileInfo[]
}
