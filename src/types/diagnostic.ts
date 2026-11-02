import type { Severity } from "@u83ism/architecture-rules"
export type { Severity }

export interface DiagnosticLocation {
  readonly filePath: string
  readonly line?: number
}

/**
 * A violation found by a rule module. `ruleId` is a rule ID of RULE_CATALOG;
 * the severity is not decided by the module but looked up from the catalog for the current level.
 */
export interface Finding<Id extends string = string> {
  readonly ruleId: Id
  readonly message: string
  readonly location: DiagnosticLocation
  readonly details?: readonly string[]
  readonly suggestion?: string
}

/** A finding with the severity of its catalog rule at the current level */
export interface Diagnostic extends Finding {
  readonly severity: Severity
}
