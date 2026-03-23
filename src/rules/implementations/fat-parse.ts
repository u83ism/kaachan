import { join } from "node:path"
import { measureFile } from "../../analysis/line-counter.js"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { FatThresholds } from "../../types/config.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "fat-parse"

const checkParseFolder = (context: RuleContext): readonly Diagnostic[] => {
  const { errorLogicFolderLines } = context.config.thresholds
  const diagnostics: Diagnostic[] = []

  for (const filePath of context.snapshot.parseFolderFiles) {
    const metricsResult = measureFile(context.morphProject, filePath)
    if (!metricsResult.ok) continue

    if (metricsResult.value.lineCount > errorLogicFolderLines) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "error",
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
): readonly Diagnostic[] => {
  if (lineCount > thresholds.warningLines) {
    return [
      {
        ruleId: RULE_ID,
        severity: "warning",
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
        ruleId: RULE_ID,
        severity: "hint",
        message: `parse.ts has ${lineCount} lines and ${functionCount} functions (shared schemas are allowed)`,
        location: { filePath },
        suggestion: `Keep under ${thresholds.hintLines} lines / ${thresholds.hintFunctions} functions.`,
      },
    ]
  }

  return []
}

export const fatParseRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 3,
  check(context: RuleContext): readonly Diagnostic[] {
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
