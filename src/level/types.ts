export type ArchitectureLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface LevelResult {
  readonly level: ArchitectureLevel
  readonly evidence: readonly string[]
  readonly missingForNext: readonly string[]
}
