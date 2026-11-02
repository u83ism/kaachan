import { isExternalServicePackage, isInsideDir, loadSourceFile } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "orchestrate-non-transactional-io",
] as const
type Id = (typeof RULE_IDS)[number]

export const crossFolderConcernsRule: Rule<Id> = {
  id: "cross-folder-concerns",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { orchestrateFolders, sourceFiles } = context.snapshot

    return orchestrateFolders.flatMap((coordinator) =>
      sourceFiles
        .filter((f) => isInsideDir(f.absolutePath, coordinator.absolutePath))
        .flatMap((f) =>
          loadSourceFile(context.morphProject, f.absolutePath)
            .getImportDeclarations()
            .map((d) => d.getModuleSpecifierValue())
            .filter(isExternalServicePackage)
            .map((specifier) => ({
              ruleId: "orchestrate-non-transactional-io" as const,
              message: `orchestrate/${coordinator.name}/ imports external service package "${specifier}" — orchestrate/ folders are for transaction orchestration only`,
              location: { filePath: f.absolutePath },
              suggestion:
                "Move external API calls to domain events + adapter pattern instead of calling them directly from orchestrate/ folders.",
            })),
        ),
    )
  },
}
