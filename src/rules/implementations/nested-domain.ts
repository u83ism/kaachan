import { resolve, dirname } from "node:path"
import type { SourceFile } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"
import type { DomainFolder } from "../../types/analysis.js"

const RULE_ID = "nested-domain"

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const isInsideDir = (filePath: string, dir: string): boolean => {
  const nFile = normalizeSep(filePath)
  const nDir = normalizeSep(dir)
  return nFile === nDir || nFile.startsWith(nDir + "/")
}

/**
 * Returns true when resolvedPath is inside domainAbsPath but at a nested level
 * (i.e. inside a subdirectory of the domain, not a top-level file).
 *
 * Example: domainUser/core/utils.ts → nested; domainUser/workflow.ts → not nested
 */
const isNestedInDomain = (resolvedPath: string, domainAbsPath: string): boolean => {
  const normalDomain = normalizeSep(domainAbsPath)
  const normalResolved = normalizeSep(resolvedPath)
  if (!normalResolved.startsWith(normalDomain + "/")) return false
  const relative = normalResolved.slice(normalDomain.length + 1)
  return relative.includes("/")
}

const checkSourceFile = (
  sourceFile: SourceFile,
  filePath: string,
  domainFolders: readonly DomainFolder[],
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []

  for (const importDecl of sourceFile.getImportDeclarations()) {
    const specifier = importDecl.getModuleSpecifierValue()
    if (!specifier.startsWith(".")) continue

    const resolvedImport = resolve(dirname(filePath), specifier)

    for (const domain of domainFolders) {
      if (!isNestedInDomain(resolvedImport, domain.absolutePath)) continue

      // Importing a nested subdomain path — only allowed from within the same domain
      if (isInsideDir(filePath, domain.absolutePath)) break // OK: parent imports its own child

      const normalDomain = normalizeSep(domain.absolutePath)
      const normalResolved = normalizeSep(resolvedImport)
      const nestedRelPath = normalResolved.slice(normalDomain.length + 1)

      diagnostics.push({
        ruleId: RULE_ID,
        severity: "error",
        message: `Import of nested path "${domain.name}/${nestedRelPath}" from outside "${domain.name}" violates parent→child isolation`,
        location: { filePath },
        suggestion: `Only files within ${domain.name}/ may access its nested subdomain paths. Expose a public API via ${domain.name}/index.ts instead.`,
      })
      break // report once per import declaration
    }
  }

  return diagnostics
}

export const nestedDomainRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 7,
  check(context: RuleContext): readonly Diagnostic[] {
    const { domainFolders } = context.snapshot
    if (domainFolders.length === 0) return []

    const diagnostics: Diagnostic[] = []

    for (const fileInfo of context.snapshot.sourceFiles) {
      const filePath = fileInfo.absolutePath
      const sourceFile =
        context.morphProject.getSourceFile(filePath) ??
        context.morphProject.addSourceFileAtPath(filePath)
      diagnostics.push(...checkSourceFile(sourceFile, filePath, domainFolders))
    }

    return diagnostics
  },
}
