import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { loadSourceFile } from "../../analysis/layer-modules.js"
import type { ArchitectureLevel } from "../../level/types.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "workflow-throws-plain-error",
] as const
type Id = (typeof RULE_IDS)[number]

/** From Lv5, business rejections travel as `err()` results; before that, as a thrown `DomainError` */
const RESULT_ERRORS_FROM_LEVEL = 5

type Advice = { readonly message: string; readonly suggestion: string }

const adviceFor = (level: ArchitectureLevel): Advice =>
  level >= RESULT_ERRORS_FROM_LEVEL
    ? {
        message: "workflow.ts throws a plain Error — return err() up to the route instead",
        suggestion:
          "Register the error code in slime.config.ts and return err(...) so the route maps it to an HTTP status.",
      }
    : {
        message: "workflow.ts throws a plain Error — a business rejection would become HTTP 500; throw a typed DomainError",
        suggestion:
          "Register the error code in slime.config.ts and throw a DomainError with it, so the framework maps it to an HTTP status.",
      }

const checkWorkflowForNewError = (
  sourceFile: SourceFile,
  filePath: string,
  advice: Advice,
): readonly Finding<Id>[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.ThrowStatement)
    .filter((stmt) => {
      const expr = stmt.getExpression()
      return (
        expr.getKind() === SyntaxKind.NewExpression &&
        expr.getFirstChildByKind(SyntaxKind.Identifier)?.getText() === "Error"
      )
    })
    .map((stmt) => ({
      ruleId: "workflow-throws-plain-error",
      message: advice.message,
      location: { filePath, line: stmt.getStartLineNumber() },
      suggestion: advice.suggestion,
    }))

export const workflowThrowsRule: Rule<Id> = {
  id: "workflow-throws",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const advice = adviceFor(context.level)
    return context.snapshot.layerFiles.workflow.flatMap((filePath) =>
      checkWorkflowForNewError(loadSourceFile(context.morphProject, filePath), filePath, advice),
    )
  },
}
