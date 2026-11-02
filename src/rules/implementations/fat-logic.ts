import { FOLDER_NAMES } from "@u83ism/architecture-rules"
import { isInFolder } from "../../analysis/layer-modules.js"
import { measureFile } from "../../analysis/line-counter.js"
import { checkPrefixes } from "../../analysis/prefix-checker.js"
import { buildTypeDependencyGraph } from "../../analysis/type-dependency-graph.js"
import type { Finding } from "../../types/diagnostic.js"
import type { FatThresholds } from "../../types/config.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "logic-size-warning",
  "logic-size-hint",
  "logic-folder-file-too-large",
] as const
type Id = (typeof RULE_IDS)[number]

const buildPrefixMixingDiagnostic = (
  filePath: string,
  severity: "warning" | "error",
  prefixes: ReadonlyMap<string, readonly string[]>,
): Finding<Id> => ({
  ruleId: severity === "error" ? "logic-folder-file-too-large" : "logic-size-warning",
  message:
    severity === "error"
      ? `${filePath} has mixed domain prefixes — resolve before Lv6 migration`
      : "logic.ts has mixed domain prefixes — functions from different domains coexist",
  location: { filePath },
  details: [...prefixes.entries()].map(
    ([prefix, fns]) => `${prefix}: ${fns.join(", ")}`,
  ),
  suggestion:
    severity === "error"
      ? "Each logic/ file should contain functions of a single domain."
      : "Split into domain-specific files (e.g. logic/user.ts, logic/order.ts).",
})

const checkLogicFile = (context: RuleContext, filePath: string): readonly Finding<Id>[] => {
  const metricsResult = measureFile(context.morphProject, filePath)
  if (!metricsResult.ok) return []

  const diagnostics: Finding<Id>[] = []
  const { lineCount, functionCount } = metricsResult.value
  const { hintLines, hintFunctions, warningLines } = context.config.thresholds

  const sourceFile = context.morphProject.getSourceFile(filePath)
  if (sourceFile !== undefined) {
    const prefixResult = checkPrefixes(sourceFile)
    if (prefixResult.hasMixing) {
      diagnostics.push(buildPrefixMixingDiagnostic(filePath, "warning", prefixResult.prefixes))
    }

    const graphResult = buildTypeDependencyGraph(sourceFile)
    if (graphResult.hasNonIntersecting) {
      diagnostics.push({
        ruleId: "logic-size-warning",
        message:
          "logic.ts has non-intersecting type dependency groups — functions operate on disconnected domains",
        location: { filePath },
        details: graphResult.groups.map(
          (g, i) =>
            `Group ${String.fromCharCode(65 + i)}: ${g.functions.join(", ")} (${g.types.join(", ")})`,
        ),
        suggestion: "Consider splitting into domain-specific files (consistent with prefix naming).",
      })
    }
  }

  if (lineCount > warningLines) {
    diagnostics.push({
      ruleId: "logic-size-warning",
      message: `logic.ts is getting large (${lineCount} lines) — consider promoting to logic/ folder`,
      location: { filePath },
      suggestion: "Promote to logic/ folder with per-domain files (e.g. logic/user.ts).",
    })
  } else if (lineCount > hintLines || functionCount > hintFunctions) {
    diagnostics.push({
      ruleId: "logic-size-hint",
      message: `logic.ts has ${lineCount} lines and ${functionCount} functions`,
      location: { filePath },
      suggestion: `Keep under ${hintLines} lines / ${hintFunctions} functions.`,
    })
  }

  return diagnostics
}

const checkLogicFolderFile = (context: RuleContext, filePath: string): readonly Finding<Id>[] => {
  const { errorLogicFolderLines } = context.config.thresholds
  const metricsResult = measureFile(context.morphProject, filePath)
  if (!metricsResult.ok) return []

  const diagnostics: Finding<Id>[] = []

  if (metricsResult.value.lineCount > errorLogicFolderLines) {
    diagnostics.push({
      ruleId: "logic-folder-file-too-large",
      message: `${filePath} exceeds ${errorLogicFolderLines} lines (${metricsResult.value.lineCount} lines) — domain split is overdue`,
      location: { filePath },
      suggestion: "Split into smaller domain-specific files within logic/.",
    })
  }

  const sourceFile = context.morphProject.getSourceFile(filePath)
  if (sourceFile !== undefined) {
    const prefixResult = checkPrefixes(sourceFile)
    if (prefixResult.hasMixing) {
      diagnostics.push(buildPrefixMixingDiagnostic(filePath, "error", prefixResult.prefixes))
    }
  }

  return diagnostics
}

export const fatLogicRule: Rule<Id> = {
  id: "fat-logic",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    return context.snapshot.layerFiles.logic.flatMap((filePath) =>
      isInFolder(filePath, FOLDER_NAMES.LOGIC)
        ? checkLogicFolderFile(context, filePath)
        : checkLogicFile(context, filePath),
    )
  },
}
