import { measureFile } from "../../analysis/line-counter.js"
import { isInFolder } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { FatThresholds } from "../../types/config.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "parse-folder-file-too-large",
  "parse-size-warning",
  "parse-size-hint",
] as const
type Id = (typeof RULE_IDS)[number]

const PARSE_FOLDER = "parse"

const checkParseFolderFile = (
  filePath: string,
  lineCount: number,
  thresholds: FatThresholds,
): readonly Finding<Id>[] => {
  const { errorLogicFolderLines } = thresholds
  if (lineCount <= errorLogicFolderLines) return []

  return [
    {
      ruleId: "parse-folder-file-too-large",
      message: `${filePath} exceeds ${errorLogicFolderLines} lines (${lineCount} lines) — split further or restructure`,
      location: { filePath },
      suggestion: "Split into smaller parse files within parse/.",
    },
  ]
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
    const { thresholds } = context.config
    return context.snapshot.layerFiles.parse.flatMap((filePath) => {
      const result = measureFile(context.morphProject, filePath)
      if (!result.ok) return []

      const { lineCount, functionCount } = result.value
      return isInFolder(filePath, PARSE_FOLDER)
        ? checkParseFolderFile(filePath, lineCount, thresholds)
        : buildDiagnostics(filePath, lineCount, functionCount, thresholds)
    })
  },
}
