import { join } from "node:path"
import { measureFile } from "../../analysis/line-counter.js"
import type { Finding } from "../../types/diagnostic.js"
import type { FatThresholds } from "../../types/config.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "parse-folder-file-too-large",
  "parse-size-warning",
  "parse-size-hint",
] as const
type Id = (typeof RULE_IDS)[number]

const checkParseFolder = (context: RuleContext): readonly Finding<Id>[] => {
  const { errorLogicFolderLines } = context.config.thresholds
  const diagnostics: Finding<Id>[] = []

  for (const filePath of context.snapshot.parseFolderFiles) {
    const metricsResult = measureFile(context.morphProject, filePath)
    if (!metricsResult.ok) continue

    if (metricsResult.value.lineCount > errorLogicFolderLines) {
      diagnostics.push({
        ruleId: "parse-folder-file-too-large",
        message: `${filePath} exceeds ${errorLogicFolderLines} lines (${metricsResult.value.lineCount} lines) — split further or restructure`,
        location: { filePath },
        suggestion: "Split into smaller parse files within parse/.",
      })
    }
  }

  return diagnostics
}

const buildDiagnostics = (
  filePath: string,
  lineCount: number,
  functionCount: number,
  thresholds: FatThresholds,
): readonly Finding<Id>[] => {
  if (lineCount > thresholds.warningLines) {
    return [
      {
        ruleId: "parse-size-warning",
        message: `parse.ts is getting large (${lineCount} lines) — consider splitting into parse/`,
        location: { filePath },
        suggestion:
          "Promote to parse/ folder with per-domain parse files (shared schemas are allowed).",
      },
    ]
  }

  if (lineCount > thresholds.hintLines || functionCount > thresholds.hintFunctions) {
    return [
      {
        ruleId: "parse-size-hint",
        message: `parse.ts has ${lineCount} lines and ${functionCount} functions (shared schemas are allowed)`,
        location: { filePath },
        suggestion: `Keep under ${thresholds.hintLines} lines / ${thresholds.hintFunctions} functions.`,
      },
    ]
  }

  return []
}

export const fatParseRule: Rule<Id> = {
  id: "fat-parse",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    if (!context.snapshot.hasParse) return []
    if (context.snapshot.hasParseFolder) return checkParseFolder(context)

    const filePath = join(context.snapshot.sourceRoot, "parse.ts")
    const result = measureFile(context.morphProject, filePath)
    if (!result.ok) return []

    return buildDiagnostics(
      filePath,
      result.value.lineCount,
      result.value.functionCount,
      context.config.thresholds,
    )
  },
}
