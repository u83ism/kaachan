import { SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { loadSourceFile } from "../../analysis/layer-modules.js"
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
    return context.snapshot.layerFiles.logic.flatMap((filePath) =>
      checkLogicFileForThrows(loadSourceFile(context.morphProject, filePath), filePath),
    )
  },
}
