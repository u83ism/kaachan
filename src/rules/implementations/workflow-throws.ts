import { join } from "node:path"
import { existsSync } from "node:fs"
import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "workflow-throws"

const checkWorkflowForNewError = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Diagnostic[] => {
  const throwStatements = sourceFile.getDescendantsOfKind(SyntaxKind.ThrowStatement)

  return throwStatements
    .filter((stmt) => {
      const expr = stmt.getExpression()
      return (
        expr.getKind() === SyntaxKind.NewExpression &&
        expr.getFirstChildByKind(SyntaxKind.Identifier)?.getText() === "Error"
      )
    })
    .map((stmt) => ({
      ruleId: RULE_ID,
      severity: "warning" as const,
      message: `workflow.ts uses new Error() directly — define a DomainError string and use Result err instead`,
      location: { filePath, line: stmt.getStartLineNumber() },
      suggestion:
        "Register the error string in slime.config.ts and return err(...) from Logic or Adapter.",
    }))
}

const collectWorkflowPaths = (context: RuleContext): readonly string[] => {
  const { sourceRoot, hasWorkflow, hasAppFolder, domainFolders } = context.snapshot
  const paths: string[] = []

  if (hasWorkflow) {
    paths.push(join(sourceRoot, "workflow.ts"))
  }

  if (hasAppFolder) {
    const appWorkflow = join(sourceRoot, "app", "workflow.ts")
    if (existsSync(appWorkflow)) paths.push(appWorkflow)
  }

  for (const domain of domainFolders) {
    const domainWorkflow = join(domain.absolutePath, "workflow.ts")
    if (existsSync(domainWorkflow)) paths.push(domainWorkflow)
  }

  return paths
}

export const workflowThrowsRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 5,
  check(context: RuleContext): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = []

    for (const filePath of collectWorkflowPaths(context)) {
      const sourceFile =
        context.morphProject.getSourceFile(filePath) ??
        context.morphProject.addSourceFileAtPath(filePath)
      diagnostics.push(...checkWorkflowForNewError(sourceFile, filePath))
    }

    return diagnostics
  },
}
