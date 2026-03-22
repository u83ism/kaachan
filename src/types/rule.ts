import type { Project } from "ts-morph"
import type { ArchitectureLevel } from "../level/types.js"
import type { Diagnostic } from "./diagnostic.js"
import type { ProjectSnapshot } from "./analysis.js"
import type { KaachanConfig } from "./config.js"

export interface RuleContext {
  readonly rootDir: string
  readonly level: ArchitectureLevel
  readonly snapshot: ProjectSnapshot
  readonly config: KaachanConfig
  readonly morphProject: Project
}

export interface Rule {
  readonly id: string
  readonly activateFromLevel: ArchitectureLevel
  check(context: RuleContext): Promise<readonly Diagnostic[]> | readonly Diagnostic[]
}

export type RuleResult = readonly Diagnostic[]
