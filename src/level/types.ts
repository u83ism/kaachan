export type { ArchitectureLevel } from "@u83ism/architecture-rules"

export interface LevelResult {
  readonly level: import("@u83ism/architecture-rules").ArchitectureLevel
  readonly evidence: readonly string[]
  readonly missingForNext: readonly string[]
}
