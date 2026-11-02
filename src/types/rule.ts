import type { Project } from "ts-morph"
import type { ArchitectureLevel } from "../level/types.js"
import type { Finding } from "./diagnostic.js"
import type { ProjectSnapshot } from "./analysis.js"
import type { KaachanConfig } from "./config.js"

export interface RuleContext {
  readonly rootDir: string
  readonly level: ArchitectureLevel
  readonly snapshot: ProjectSnapshot
  readonly config: KaachanConfig
  readonly morphProject: Project
}

/**
 * A rule module: one detection unit that reports one or more RULE_CATALOG rules.
 * The module runs when at least one of its `ruleIds` is active at the current level.
 */
export interface Rule<Id extends string = string> {
  /** Module identifier (also accepted by --disable-rule to skip the whole module) */
  readonly id: string
  /** RULE_CATALOG rule IDs this module reports */
  readonly ruleIds: readonly Id[]
  check(context: RuleContext): Promise<readonly Finding<Id>[]> | readonly Finding<Id>[]
}

export type RuleResult = readonly Finding[]
