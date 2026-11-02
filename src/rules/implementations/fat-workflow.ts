import { join } from "node:path"
import { measureFile } from "../../analysis/line-counter.js"
import type { Finding } from "../../types/diagnostic.js"
import type { FatThresholds } from "../../types/config.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "workflow-size-warning",
  "workflow-size-hint",
] as const
type Id = (typeof RULE_IDS)[number]

const buildDiagnostics = (
  filePath: string,
  lineCount: number,
  functionCount: number,
  thresholds: FatThresholds,
): readonly Finding<Id>[] => {
  if (lineCount > thresholds.warningLines) {
    return [
      {
        ruleId: "workflow-size-warning",
        message: `workflow.ts is getting large (${lineCount} lines) — consider splitting into domain workflows`,
        location: { filePath },
        suggestion: "Extract domain-specific workflows into separate files.",
      },
    ]
  }

  if (lineCount > thresholds.hintLines || functionCount > thresholds.hintFunctions) {
    return [
      {
        ruleId: "workflow-size-hint",
        message: `workflow.ts has ${lineCount} lines and ${functionCount} functions`,
        location: { filePath },
        suggestion: `Keep under ${thresholds.hintLines} lines / ${thresholds.hintFunctions} functions.`,
      },
    ]
  }

  return []
}

export const fatWorkflowRule: Rule<Id> = {
  id: "fat-workflow",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    if (!context.snapshot.hasWorkflow) return []

    const filePath = join(context.snapshot.sourceRoot, "workflow.ts")
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
