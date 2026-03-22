import type { Severity } from "@u83ism/architecture-rules"
export type { Severity }

export interface DiagnosticLocation {
  readonly filePath: string
  readonly line?: number
}

export interface Diagnostic {
  readonly ruleId: string
  readonly severity: Severity
  readonly message: string
  readonly location: DiagnosticLocation
  readonly details?: readonly string[]
  readonly suggestion?: string
}
