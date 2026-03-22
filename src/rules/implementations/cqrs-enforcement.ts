import { join, resolve, dirname } from "node:path"
import { measureFile } from "../../analysis/line-counter.js"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"
import type { DomainFolder } from "../../types/analysis.js"

const RULE_ID = "cqrs-enforcement"

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const stripExtension = (p: string): string => p.replace(/\.(ts|js)$/, "")

const isInsideDir = (filePath: string, dir: string): boolean => {
  const nFile = normalizeSep(filePath)
  const nDir = normalizeSep(dir)
  return nFile === nDir || nFile.startsWith(nDir + "/")
}

/**
 * Check 1: command/ files importing from query/ — CQRS boundary violation
 */
const checkCommandQueryImports = (
  context: RuleContext,
  domain: DomainFolder,
  commandDir: string,
  queryDir: string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []
  const queryDirNorm = normalizeSep(queryDir)

  for (const fileInfo of context.snapshot.sourceFiles) {
    if (!isInsideDir(fileInfo.absolutePath, commandDir)) continue

    const sf =
      context.morphProject.getSourceFile(fileInfo.absolutePath) ??
      context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)

    for (const importDecl of sf.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue()
      if (!specifier.startsWith(".")) continue

      const resolvedNorm = normalizeSep(
        stripExtension(resolve(dirname(fileInfo.absolutePath), specifier)),
      )

      if (!isInsideDir(resolvedNorm, queryDirNorm)) continue

      diagnostics.push({
        ruleId: RULE_ID,
        severity: "error",
        message: `${domain.name}/command/ imports from query/ ("${specifier}") — command and query must not cross-reference`,
        location: { filePath: fileInfo.absolutePath },
        suggestion:
          "Use shared ports.ts or shared/ for types needed by both command and query sides.",
      })
    }
  }

  return diagnostics
}

/**
 * Check 2: query/ file bloat
 */
const checkQueryBloat = (
  context: RuleContext,
  domain: DomainFolder,
  queryDir: string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []
  const hintLines = context.config.thresholds.hintLines

  for (const fileInfo of context.snapshot.sourceFiles) {
    if (!isInsideDir(fileInfo.absolutePath, queryDir)) continue

    const metrics = measureFile(context.morphProject, fileInfo.absolutePath)
    if (!metrics.ok) continue

    if (metrics.value.lineCount > hintLines) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "hint",
        message: `${domain.name}/query/ file is growing large (${metrics.value.lineCount} lines) — consider splitting query concerns`,
        location: { filePath: fileInfo.absolutePath },
        suggestion: "Split into smaller, focused query files (e.g., by use-case or aggregate).",
      })
    }
  }

  return diagnostics
}

/**
 * Check 3: query/-internal shared abstraction — a non-ports helper inside query/
 * that is imported by 2 or more other files in the same query/ folder.
 */
const checkQuerySharedAbstraction = (
  context: RuleContext,
  domain: DomainFolder,
  queryDir: string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []
  const queryDirNorm = normalizeSep(queryDir)

  const queryFiles = context.snapshot.sourceFiles.filter((f) =>
    isInsideDir(f.absolutePath, queryDir),
  )

  // importedBy: normalizedTargetBase → Set<importerAbsPath>
  const importedBy = new Map<string, Set<string>>()

  for (const fileInfo of queryFiles) {
    const sf =
      context.morphProject.getSourceFile(fileInfo.absolutePath) ??
      context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)

    for (const importDecl of sf.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue()
      if (!specifier.startsWith(".")) continue

      const resolvedBase = normalizeSep(
        stripExtension(resolve(dirname(fileInfo.absolutePath), specifier)),
      )

      if (!isInsideDir(resolvedBase, queryDirNorm)) continue

      // Skip ports.ts — it is intended to be shared
      const leaf = resolvedBase.split("/").at(-1) ?? ""
      if (leaf === "ports") continue

      if (!importedBy.has(resolvedBase)) importedBy.set(resolvedBase, new Set())
      importedBy.get(resolvedBase)?.add(fileInfo.absolutePath)
    }
  }

  for (const [targetBase, importers] of importedBy) {
    if (importers.size >= 2) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "warning",
        message: `${domain.name}/query/ shared abstraction: a query-internal helper is imported by ${importers.size} query files`,
        location: { filePath: targetBase + ".ts" },
        suggestion:
          "Move shared query helpers to shared/ or expose them via ports.ts to avoid internal query coupling.",
      })
    }
  }

  return diagnostics
}

/**
 * Check 4: query/ files importing domain logic
 */
const checkQueryLogicImports = (
  context: RuleContext,
  domain: DomainFolder,
  queryDir: string,
): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []
  const logicBase = normalizeSep(join(domain.absolutePath, "logic"))

  for (const fileInfo of context.snapshot.sourceFiles) {
    if (!isInsideDir(fileInfo.absolutePath, queryDir)) continue

    const sf =
      context.morphProject.getSourceFile(fileInfo.absolutePath) ??
      context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)

    for (const importDecl of sf.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue()
      if (!specifier.startsWith(".")) continue

      const resolvedBase = normalizeSep(
        stripExtension(resolve(dirname(fileInfo.absolutePath), specifier)),
      )

      // Matches domain/logic.ts or domain/logic/*
      if (resolvedBase !== logicBase && !isInsideDir(resolvedBase, logicBase)) continue

      diagnostics.push({
        ruleId: RULE_ID,
        severity: "warning",
        message: `${domain.name}/query/ imports domain logic ("${specifier}") — query/ should use ReadPort and read models only`,
        location: { filePath: fileInfo.absolutePath },
        suggestion:
          "Replace domain logic usage with ReadPort and read model projections in query files.",
      })
    }
  }

  return diagnostics
}

export const cqrsEnforcementRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 10,
  check(context: RuleContext): readonly Diagnostic[] {
    const cqrsDomains = context.snapshot.domainFolders.filter(
      (d) => d.hasCommand && d.hasQuery,
    )

    if (cqrsDomains.length === 0) return []

    const diagnostics: Diagnostic[] = []

    for (const domain of cqrsDomains) {
      const commandDir = join(domain.absolutePath, "command")
      const queryDir = join(domain.absolutePath, "query")

      diagnostics.push(
        ...checkCommandQueryImports(context, domain, commandDir, queryDir),
        ...checkQueryBloat(context, domain, queryDir),
        ...checkQuerySharedAbstraction(context, domain, queryDir),
        ...checkQueryLogicImports(context, domain, queryDir),
      )
    }

    return diagnostics
  },
}
