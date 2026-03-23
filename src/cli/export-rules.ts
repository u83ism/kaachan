import { getLevelDefinition } from "@u83ism/architecture-rules"
import type { ArchitectureLevel } from "@u83ism/architecture-rules"
import type { AnalysisResult } from "../types/config.js"
import type { FatThresholds } from "../types/config.js"

export type RulesTarget = "claude" | "cursor" | "cline" | "gemini"

export const ALL_TARGETS: readonly RulesTarget[] = ["claude", "cursor", "cline", "gemini"]

export const outputPathForTarget = (target: RulesTarget): string => {
  switch (target) {
    case "claude":
      return "CLAUDE.md"
    case "cursor":
      return ".cursor/rules/slime-architecture.md"
    case "cline":
      return ".clinerules"
    case "gemini":
      return "GEMINI.md"
  }
}

const LEVEL_CONSTRAINTS: Readonly<Record<ArchitectureLevel, readonly string[]>> = {
  1: ["route.ts handles routing only — no business logic inline"],
  2: [
    "workflow.ts handles business flow — no HTTP concerns (req/res)",
    "middleware.ts handles HTTP gate (auth, rate-limit) — not workflow.ts",
    "route.ts must not define inline handlers — extract to workflow.ts",
  ],
  3: [
    "parse.ts is the HTTP boundary — converts unknown input to typed domain values",
    "parse.ts must not access DB or call repository.ts",
    "workflow.ts must not parse raw input directly — delegate to parse.ts",
  ],
  4: [
    "repository.ts exported functions: reads use find*/list*/get*/count*/search*, writes use create*/save*/update*/delete*/remove*",
    "repository.ts must return plain domain types — not ORM-generated types",
    "workflow.ts must not import ORM packages directly",
  ],
  5: [
    "logic.ts / logic/*.ts functions must have a domain prefix (userCan*, orderCan*, calcOrder*, etc.)",
    "logic functions must return Result type for business rejections — no throw",
    "logic functions must have corresponding test files",
    "logic functions must not import repository.ts or client.ts",
    "slime.config.ts must define an errors map: DomainError strings → HTTP status codes",
    "workflow.ts should use throw only for TechnicalErrors — use Result err + slime.config.ts for DomainErrors",
  ],
  6: [
    "domain folders (domainXxx/) must not import from each other directly",
    "only app/ may import domain folders",
    "app/route.ts must be an aggregator only — no URL literals",
    "route definitions belong in domain/*/routes.ts",
    "client.ts must only be accessed via its adapter.ts (ACL boundary)",
  ],
  7: [
    "cross-domain coordination belongs in cross-* folders",
    "cross-* folders must not import from app/ directly",
    "Logic tests are mandatory — missing test files are errors at Lv7",
    "nested domain isolation: domainA must not import subdirectories of domainB",
  ],
  8: [
    "domain events are defined in shared/events.ts",
    "event types must have a readonly type discriminant field (e.g. readonly type: 'UserCreated')",
    "event types must not contain class instances",
    "cross-* folders handle transaction orchestration only — external API calls belong in domain adapters",
  ],
  9: [
    "domain logic is isolated from infrastructure via ports.ts interfaces",
    "ORM imports are only allowed inside infrastructure/ folder",
    "workflow functions accept Port arguments for DB/external access (no direct Store calls)",
    "Ports & Adapters: infrastructure/ implements the ports.ts contracts",
  ],
  10: [
    "CQRS: write operations live in domain/*/command/, read operations in domain/*/query/",
    "command/ must not import from query/ — reads and writes are fully separated",
    "query/ should not import domain logic — use ReadPort and read models only",
    "query/ files must not grow large — split further if needed",
  ],
}

const buildConstraintsSection = (level: ArchitectureLevel): string => {
  const constraints = LEVEL_CONSTRAINTS[level]
  return constraints.map((c) => `- ${c}`).join("\n")
}

const buildThresholdsSection = (thresholds: FatThresholds): string =>
  [
    `- Hint: > ${thresholds.hintLines} lines or > ${thresholds.hintFunctions} functions`,
    `- Warning: > ${thresholds.warningLines} lines`,
    `- Error (logic/ or parse/ folder files): > ${thresholds.errorLogicFolderLines} lines`,
  ].join("\n")

const buildAiGuidanceSection = (level: ArchitectureLevel, thresholds: FatThresholds): string => {
  const lines: string[] = []

  if (level <= 5) {
    lines.push(
      `### When Kaachan reports hints (> ${thresholds.hintLines} lines / > ${thresholds.hintFunctions} functions)`,
      "1. Ask the user to identify the distinct business concerns in the file",
      "2. Help verbalize domain groupings (e.g. user operations vs. order operations)",
      "3. Propose a split plan and folder structure",
      level < 5
        ? "4. Consider whether reaching the next architecture level is appropriate"
        : "4. Suggest Lv6 migration when domain boundaries become clear",
    )
  }

  if (level >= 5) {
    lines.push(
      "",
      "### Logic layer guidance",
      "- Logic function inputs must be resolved primitives — not entity IDs that require DB lookup",
      "  - OK: `userCanCreate(alreadyExists: boolean)`",
      "  - NG: `userCanCreate(email: string)` — implies the function needs to call Store internally",
      "- Adapter functions translate external error codes to DomainError strings — they must not contain business judgment",
    )
  }

  if (level >= 6) {
    lines.push(
      "",
      "### Domain boundary guidance",
      "- When a file is ambiguous about which domain it belongs to, ask the user — do not auto-assign",
      "- Use Kaachan's non-intersecting type group detection as a starting point for domain naming",
    )
  }

  return lines.join("\n")
}

const buildMigrationSection = (result: AnalysisResult): string => {
  if (result.missingForNext.length === 0) {
    return `Already at the maximum architecture level (Lv${result.level}).`
  }
  const nextLevel = (result.level + 1) as ArchitectureLevel
  const def = getLevelDefinition(nextLevel)
  const items = result.missingForNext.map((m) => `- ${m}`).join("\n")
  return [`**Lv${nextLevel} — ${def.name}**`, items].join("\n")
}

export const generateRulesContent = (
  result: AnalysisResult,
  thresholds: FatThresholds,
): string => {
  const def = getLevelDefinition(result.level)

  return [
    `# Slime Architecture Rules (Lv${result.level} — ${def.name})`,
    `> Generated by kaachan export:rules`,
    "",
    "## Current Architecture Level",
    `**Lv${result.level} — ${def.name}**`,
    "",
    `Evidence: ${result.levelEvidence.join(", ")}`,
    "",
    "## Active Constraints",
    "",
    buildConstraintsSection(result.level),
    "",
    "## Fat Detection Thresholds",
    "",
    buildThresholdsSection(thresholds),
    "",
    "## AI Guidance",
    "",
    buildAiGuidanceSection(result.level, thresholds),
    "",
    "## Next Level Migration",
    "",
    buildMigrationSection(result),
  ].join("\n")
}
