import { join } from "node:path"
import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "logic-throws"

const checkLogicFileForThrows = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Diagnostic[] => {
  const throwStatements = sourceFile.getDescendantsOfKind(SyntaxKind.ThrowStatement)

  return throwStatements.map((stmt) => ({
    ruleId: RULE_ID,
    severity: "error" as const,
    message: `Logic file contains a throw statement — Logic layer must not throw`,
    location: { filePath, line: stmt.getStartLineNumber() },
    suggestion:
      "Return err(...) instead of throwing. The Workflow layer may throw after receiving the error result.",
  }))
}

export const logicThrowsRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 5,
  check(context: RuleContext): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = []

    if (context.snapshot.hasLogic && !context.snapshot.hasLogicFolder) {
      const filePath = join(context.snapshot.sourceRoot, "logic.ts")
      const sourceFile =
        context.morphProject.getSourceFile(filePath) ??
        context.morphProject.addSourceFileAtPath(filePath)
      diagnostics.push(...checkLogicFileForThrows(sourceFile, filePath))
    }

    for (const logicFilePath of context.snapshot.logicFolderFiles) {
      const sourceFile =
        context.morphProject.getSourceFile(logicFilePath) ??
        context.morphProject.addSourceFileAtPath(logicFilePath)
      diagnostics.push(...checkLogicFileForThrows(sourceFile, logicFilePath))
    }

    return diagnostics
  },
}
