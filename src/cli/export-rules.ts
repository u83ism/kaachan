import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { RULES_TARGETS, renderRulesForTarget, rulesTemplateSpecifier } from "@u83ism/architecture-rules"
import type { ArchitectureLevel, RulesTarget } from "@u83ism/architecture-rules"
import type { Result } from "../types/index.js"

export type { RulesTarget }

export type RulesTargetId = RulesTarget["id"]

export const TARGET_IDS: readonly RulesTargetId[] = RULES_TARGETS.map((t) => t.id)

/** The targets to write: all of them without `--target`, otherwise the named one (an unknown name is an error) */
export const selectTargets = (targetOption: string | undefined): Result<readonly RulesTarget[]> => {
  if (targetOption === undefined) return { ok: true, value: RULES_TARGETS }
  const target = RULES_TARGETS.find((t) => t.id === targetOption)
  return target === undefined
    ? { ok: false, error: `Unknown target "${targetOption}" — expected one of: ${TARGET_IDS.join(", ")}` }
    : { ok: true, value: [target] }
}

/** The rules file content for a target: the shared level template with the target's frontmatter */
export const renderRulesFile = (template: string, target: RulesTarget): string =>
  renderRulesForTarget(template, target)

const require = createRequire(import.meta.url)

/** Read the shared rules template of the level (`@u83ism/architecture-rules/rules/lv5.md`) */
export const loadRulesTemplate = (level: ArchitectureLevel): Result<string> => {
  const specifier = rulesTemplateSpecifier(level)
  try {
    return { ok: true, value: readFileSync(require.resolve(specifier), "utf8") }
  } catch (e) {
    return { ok: false, error: `Failed to read the rules template ${specifier}: ${String(e)}` }
  }
}
