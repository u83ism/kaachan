import { join } from "node:path"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "logic-imports"

const FORBIDDEN_LAYER_MODULES = ["repository", "client"] as const

const extractLastSegment = (specifier: string): string => {
  const normalized = specifier.replace(/\.(js|ts)$/, "")
  return normalized.split("/").at(-1) ?? ""
}

const isForbiddenImport = (specifier: string): boolean =>
  (FORBIDDEN_LAYER_MODULES as readonly string[]).includes(extractLastSegment(specifier))

const checkLogicFile = (sourceFile: SourceFile, filePath: string): readonly Diagnostic[] => {
  const violations = sourceFile
    .getImportDeclarations()
    .map((i) => i.getModuleSpecifierValue())
    .filter(isForbiddenImport)

  if (violations.length === 0) return []

  return violations.map((spec) => ({
    ruleId: RULE_ID,
    severity: "error" as const,
    message: `Logic file imports "${spec}" — Logic layer must not depend on Repository or Client`,
    location: { filePath },
    suggestion:
      "Move DB/client access to workflow.ts and pass results into logic functions as arguments.",
  }))
}

export const logicImportsRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 5,
  check(context: RuleContext): readonly Diagnostic[] {
    const diagnostics: Diagnostic[] = []

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
