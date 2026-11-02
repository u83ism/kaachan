import { join } from "node:path"
import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "logic-throws",
] as const
type Id = (typeof RULE_IDS)[number]

const checkLogicFileForThrows = (
  sourceFile: SourceFile,
  filePath: string,
): readonly Finding<Id>[] => {
  const throwStatements = sourceFile.getDescendantsOfKind(SyntaxKind.ThrowStatement)

  return throwStatements.map((stmt) => ({
    ruleId: "logic-throws",
    message: `Logic file contains a throw statement — Logic layer must not throw`,
    location: { filePath, line: stmt.getStartLineNumber() },
    suggestion:
      "Return err(...) instead of throwing. The Workflow layer may throw after receiving the error result.",
  }))
}

export const logicThrowsRule: Rule<Id> = {
  id: "logic-throws",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const diagnostics: Finding<Id>[] = []

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
