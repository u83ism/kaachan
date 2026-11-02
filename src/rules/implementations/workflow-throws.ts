import { SyntaxKind } from "ts-morph"
import type { SourceFile, ThrowStatement } from "ts-morph"
import { loadSourceFile } from "../../analysis/layer-modules.js"
import type { ArchitectureLevel } from "../../level/types.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "workflow-throws-plain-error",
  "workflow-throws-domain-error",
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

/** Name of the class in `throw new X(...)`, or undefined for other throws */
const thrownClassName = (stmt: ThrowStatement): string | undefined => {
  const expr = stmt.getExpression()
  return expr.getKind() === SyntaxKind.NewExpression
    ? expr.getFirstChildByKind(SyntaxKind.Identifier)?.getText()
    : undefined
}

const throwsOf = (sourceFile: SourceFile, className: string): readonly ThrowStatement[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.ThrowStatement)
    .filter((stmt) => thrownClassName(stmt) === className)

const checkWorkflowForNewError = (
  sourceFile: SourceFile,
  filePath: string,
  advice: Advice,
): readonly Finding<Id>[] =>
  throwsOf(sourceFile, "Error").map((stmt) => ({
    ruleId: "workflow-throws-plain-error",
    message: advice.message,
    location: { filePath, line: stmt.getStartLineNumber() },
    suggestion: advice.suggestion,
  }))

// The catalog activates this rule from Lv5 only, so the Lv3–4 DomainError throws are never reported
const checkWorkflowForDomainError = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] =>
  throwsOf(sourceFile, "DomainError").map((stmt) => ({
    ruleId: "workflow-throws-domain-error",
    message: "workflow.ts throws a DomainError — from Lv5, return err() up to the route instead",
    location: { filePath, line: stmt.getStartLineNumber() },
    suggestion:
      "Return the rejection as a Result (return err(\"CODE\") or return the failed logic check) so the route maps it to an HTTP status. Keep throw for technical failures.",
  }))

export const workflowThrowsRule: Rule<Id> = {
  id: "workflow-throws",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const advice = adviceFor(context.level)
    return context.snapshot.layerFiles.workflow.flatMap((filePath) => {
      const sourceFile = loadSourceFile(context.morphProject, filePath)
      return [
        ...checkWorkflowForNewError(sourceFile, filePath, advice),
        ...checkWorkflowForDomainError(sourceFile, filePath),
      ]
    })
  },
}
