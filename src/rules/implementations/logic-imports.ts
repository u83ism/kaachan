import type { SourceFile } from "ts-morph"
import { isOrmImport, lastSegment, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "logic-store-client-import",
] as const
type Id = (typeof RULE_IDS)[number]

const FORBIDDEN_LAYER_MODULES = ["store", "client"] as const

const isForbiddenImport = (specifier: string): boolean =>
  (FORBIDDEN_LAYER_MODULES as readonly string[]).includes(lastSegment(specifier)) ||
  isOrmImport(specifier)

const checkLogicFile = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const violations = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter(isForbiddenImport)

  return violations.map((spec) => ({
    ruleId: "logic-store-client-import",
    message: `Logic file imports "${spec}" — Logic layer must not depend on Store, Client or the database`,
    location: { filePath },
    suggestion:
      "Move DB/client access to workflow.ts and pass results into logic functions as arguments.",
  }))
}

export const logicImportsRule: Rule<Id> = {
  id: "logic-imports",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    return context.snapshot.layerFiles.logic.flatMap((filePath) =>
      checkLogicFile(loadSourceFile(context.morphProject, filePath), filePath),
    )
  },
}
