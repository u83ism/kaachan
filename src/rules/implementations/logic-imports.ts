import { join } from "node:path"
import type { SourceFile } from "ts-morph"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "logic-store-client-import",
] as const
type Id = (typeof RULE_IDS)[number]

const FORBIDDEN_LAYER_MODULES = ["store", "client"] as const

const extractLastSegment = (specifier: string): string => {
  const normalized = specifier.replace(/\.(js|ts)$/, "")
  return normalized.split("/").at(-1) ?? ""
}

const isForbiddenImport = (specifier: string): boolean =>
  (FORBIDDEN_LAYER_MODULES as readonly string[]).includes(extractLastSegment(specifier))

const checkLogicFile = (sourceFile: SourceFile, filePath: string): readonly Finding<Id>[] => {
  const violations = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter(isForbiddenImport)

  if (violations.length === 0) return []

  return violations.map((spec) => ({
    ruleId: "logic-store-client-import",
    message: `Logic file imports "${spec}" — Logic layer must not depend on Store or Client`,
    location: { filePath },
    suggestion:
      "Move DB/client access to workflow.ts and pass results into logic functions as arguments.",
  }))
}

export const logicImportsRule: Rule<Id> = {
  id: "logic-imports",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const diagnostics: Finding<Id>[] = []

    // Check logic.ts (exists when hasLogic is true but hasLogicFolder is false)
    if (context.snapshot.hasLogic && !context.snapshot.hasLogicFolder) {
      const filePath = join(context.snapshot.sourceRoot, "logic.ts")
      const sourceFile =
        context.morphProject.getSourceFile(filePath) ??
        context.morphProject.addSourceFileAtPath(filePath)
      diagnostics.push(...checkLogicFile(sourceFile, filePath))
    }

    // Check logic/*.ts files
    for (const logicFilePath of context.snapshot.logicFolderFiles) {
      const sourceFile =
        context.morphProject.getSourceFile(logicFilePath) ??
        context.morphProject.addSourceFileAtPath(logicFilePath)
      diagnostics.push(...checkLogicFile(sourceFile, logicFilePath))
    }

    return diagnostics
  },
}
