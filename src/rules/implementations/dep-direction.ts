import { resolve, dirname, join } from "node:path"
import type { SourceFile } from "ts-morph"
import { findDependencyCycles } from "../../analysis/domain-graph.js"
import { isInsideDir } from "../../analysis/layer-modules.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"
import type { DomainFolder } from "../../types/analysis.js"

const RULE_IDS = [
  "domain-undeclared-import",
  "shared-imports-domain",
  "domain-dependency-cycle",
] as const
type Id = (typeof RULE_IDS)[number]

const findTargetDomain = (
  resolvedImport: string,
  domainFolders: readonly DomainFolder[],
): DomainFolder | undefined =>
  domainFolders.find((d) => isInsideDir(resolvedImport, d.absolutePath))

/** Domains the domain may import, from `domains` in slime.config.ts (none when undeclared) */
const declaredDependencies = (context: RuleContext, domain: string): readonly string[] =>
  context.slimeConfig.kind === "found" ? (context.slimeConfig.domains?.[domain] ?? []) : []

const checkSourceFile = (
  sourceFile: SourceFile,
  filePath: string,
  context: RuleContext,
): readonly Finding<Id>[] => {
  const { domainFolders, sourceRoot } = context.snapshot
  if (domainFolders.length === 0) return []

  const sharedDir = join(sourceRoot, "shared")

  const importerInShared = isInsideDir(filePath, sharedDir)
  const importerDomain = domainFolders.find((d) => isInsideDir(filePath, d.absolutePath))

  const diagnostics: Finding<Id>[] = []

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const specifier = importDecl.getModuleSpecifierValue()
    if (!specifier.startsWith(".")) continue

    const resolvedImport = resolve(dirname(filePath), specifier)
    const targetDomain = findTargetDomain(resolvedImport, domainFolders)
    if (targetDomain === undefined) continue

    if (importerDomain !== undefined) {
      const isDeclared = declaredDependencies(context, importerDomain.name).includes(targetDomain.name)
      if (importerDomain.name !== targetDomain.name && !isDeclared) {
        diagnostics.push({
          ruleId: "domain-undeclared-import",
          message: `domains/${importerDomain.name}/ imports domains/${targetDomain.name}/, which slime.config.ts does not declare as a dependency of "${importerDomain.name}"`,
          location: { filePath },
          suggestion: `If ${importerDomain.name} depends on ${targetDomain.name}, declare it in slime.config.ts (domains: { ${importerDomain.name}: ["${targetDomain.name}"] }). Otherwise combine them in app/ or orchestrate/.`,
        })
      }
    } else if (importerInShared) {
      diagnostics.push({
        ruleId: "shared-imports-domain",
        message: `shared/ imports from domain "${targetDomain.name}" — shared must not depend on domains`,
        location: { filePath },
        suggestion:
          "Move domain-specific logic out of shared/, or invert the dependency via events.",
      })
    }
  }

  return diagnostics
}

const checkDeclaredCycles = (context: RuleContext): readonly Finding<Id>[] => {
  const { slimeConfig } = context
  if (slimeConfig.kind !== "found" || slimeConfig.domains === undefined) return []

  return findDependencyCycles(slimeConfig.domains).map((cycle) => ({
    ruleId: "domain-dependency-cycle",
    message: `slime.config.ts declares a cycle between domains: ${cycle.join(" → ")}`,
    location: { filePath: slimeConfig.filePath },
    suggestion:
      "Make the dependencies one-way: move what both sides need into the upstream domain, or combine the domains in app/ or orchestrate/ instead of importing each other.",
  }))
}

export const depDirectionRule: Rule<Id> = {
  id: "dep-direction",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const diagnostics: Finding<Id>[] = []

    for (const fileInfo of context.snapshot.sourceFiles) {
      const filePath = fileInfo.absolutePath
      const sourceFile =
        context.morphProject.getSourceFile(filePath) ??
        context.morphProject.addSourceFileAtPath(filePath)
      diagnostics.push(...checkSourceFile(sourceFile, filePath, context))
    }

    return [...diagnostics, ...checkDeclaredCycles(context)]
  },
}
