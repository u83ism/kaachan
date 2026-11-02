import type { ArchitectureLevel } from "@u83ism/architecture-rules"
export type { ArchitectureLevel }

/** `level` is null when no Slime Architecture signal was found (no `route.ts` and no domain structure) */
export interface LevelResult {
  readonly level: ArchitectureLevel | null
  readonly evidence: readonly string[]
  readonly missingForNext: readonly string[]
}
