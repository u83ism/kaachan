import { isInsideDir, loadSourceFile, relativeImports } from "../../analysis/layer-modules.js"
import type { DomainFolder, OrchestrateFolder } from "../../types/analysis.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "domain-imports-orchestrate",
  "orchestrate-imports-orchestrate",
] as const
type Id = (typeof RULE_IDS)[number]

interface FolderImport<T> {
  readonly filePath: string
  readonly line: number
  readonly target: T
}

/** Relative imports of the files inside the folder that point into one of the targets */
const importsInto = <T extends { readonly absolutePath: string }>(
  context: RuleContext,
  folderPath: string,
  targets: readonly T[],
): readonly FolderImport<T>[] =>
  context.snapshot.sourceFiles
    .filter((f) => isInsideDir(f.absolutePath, folderPath))
    .flatMap((f) =>
      relativeImports(loadSourceFile(context.morphProject, f.absolutePath), f.absolutePath).flatMap((i) => {
        const target = targets.find((t) => isInsideDir(i.resolved, t.absolutePath))
        return target === undefined ? [] : [{ filePath: f.absolutePath, line: i.line, target }]
      }),
    )

const checkDomain = (context: RuleContext, domain: DomainFolder): readonly Finding<Id>[] =>
  importsInto(context, domain.absolutePath, context.snapshot.orchestrateFolders).map((i) => ({
    ruleId: "domain-imports-orchestrate",
    message: `domains/${domain.name}/ imports orchestrate/${i.target.name}/ — coordinators stand above the domains`,
    location: { filePath: i.filePath, line: i.line },
    suggestion:
      "Let the coordinator call the domain, not the other way round. Return a domain event or a value and let app/ or the coordinator decide what follows.",
  }))

const checkCoordinator = (context: RuleContext, coordinator: OrchestrateFolder): readonly Finding<Id>[] => {
  const others = context.snapshot.orchestrateFolders.filter((o) => o.name !== coordinator.name)
  return importsInto(context, coordinator.absolutePath, others).map((i) => ({
    ruleId: "orchestrate-imports-orchestrate",
    message: `orchestrate/${coordinator.name}/ imports orchestrate/${i.target.name}/ — coordinators must not depend on each other`,
    location: { filePath: i.filePath, line: i.line },
    suggestion: "Combine the two coordinators in app/, or move what they share into a domain (or shared/).",
  }))
}

export const orchestrateBoundaryRule: Rule<Id> = {
  id: "orchestrate-boundary",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { domainFolders, orchestrateFolders } = context.snapshot
    return [
      ...domainFolders.flatMap((d) => checkDomain(context, d)),
      ...orchestrateFolders.flatMap((o) => checkCoordinator(context, o)),
    ]
  },
}
