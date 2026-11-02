import { resolve, dirname, join } from "node:path"
import type { SourceFile } from "ts-morph"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"
import type { DomainFolder } from "../../types/analysis.js"

const RULE_IDS = [
  "domain-undeclared-import",
  "shared-imports-domain",
] as const
type Id = (typeof RULE_IDS)[number]

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const isInsideDir = (filePath: string, dir: string): boolean => {
  const nFile = normalizeSep(filePath)
  const nDir = normalizeSep(dir)
  return nFile === nDir || nFile.startsWith(nDir + "/")
}

const findTargetDomain = (
  resolvedImport: string,
  domainFolders: readonly DomainFolder[],
): DomainFolder | undefined =>
  domainFolders.find((d) => isInsideDir(resolvedImport, d.absolutePath))

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
      if (importerDomain.name !== targetDomain.name) {
        diagnostics.push({
          ruleId: "domain-undeclared-import",
          message: `Cross-domain import: "${importerDomain.name}" imports from "${targetDomain.name}"`,
          location: { filePath },
          suggestion:
            "Use shared events or app-level orchestration instead of direct cross-domain imports.",
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

    return diagnostics
  },
}
