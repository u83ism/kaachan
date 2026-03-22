import { join, resolve, dirname } from "node:path"
import { existsSync } from "node:fs"
import { SyntaxKind } from "ts-morph"
import { measureFile } from "../../analysis/line-counter.js"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "fat-routing"

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const stripExtension = (p: string): string => p.replace(/\.(ts|js)$/, "")

const isUrlPath = (s: string): boolean => /^\//.test(s)

const collectImportedPaths = (
  context: RuleContext,
  routeFiles: readonly string[],
): ReadonlySet<string> => {
  const importedPaths = new Set<string>()
  for (const routeFilePath of routeFiles) {
    const sf =
      context.morphProject.getSourceFile(routeFilePath) ??
      context.morphProject.addSourceFileAtPath(routeFilePath)
    for (const importDecl of sf.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue()
      if (!specifier.startsWith(".")) continue
      const resolvedBase = normalizeSep(
        stripExtension(resolve(dirname(routeFilePath), specifier)),
      )
      importedPaths.add(resolvedBase)
    }
  }
  return importedPaths
}

export const fatRoutingRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 6,
  check(context: RuleContext): readonly Diagnostic[] {
    if (!context.snapshot.hasAppFolder) return []

    const appRouteFile = join(context.snapshot.sourceRoot, "app", "route.ts")
    if (!existsSync(appRouteFile)) return []

    const diagnostics: Diagnostic[] = []
    const thresholds = context.config.thresholds

    // Check 1: app/route.ts size
    const metrics = measureFile(context.morphProject, appRouteFile)
    if (metrics.ok) {
      const { lineCount, functionCount } = metrics.value
      if (lineCount > thresholds.warningLines) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "warning",
          message: `app/route.ts is too large (${lineCount} lines) — consider splitting by domain`,
          location: { filePath: appRouteFile },
          suggestion: "Move route definitions to domain/*/route.ts files.",
        })
      } else if (lineCount > thresholds.hintLines || functionCount > thresholds.hintFunctions) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "hint",
          message: `app/route.ts is growing large (${lineCount} lines, ${functionCount} functions)`,
          location: { filePath: appRouteFile },
          suggestion: "Consider moving route definitions to domain/*/route.ts files.",
        })
      }
    }

    const routeSourceFile =
      context.morphProject.getSourceFile(appRouteFile) ??
      context.morphProject.addSourceFileAtPath(appRouteFile)

    // Check 2: URL string literals in app/route.ts (route definitions that should live in domains)
    const urlLiterals = routeSourceFile
      .getDescendantsOfKind(SyntaxKind.StringLiteral)
      .filter((node) => isUrlPath(node.getLiteralValue()))
    if (urlLiterals.length > 0) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "warning",
        message: `app/route.ts defines routes directly — at Lv6, move to domain/*/routes.ts`,
        location: { filePath: appRouteFile },
        details: urlLiterals.map((n) => n.getLiteralValue()),
        suggestion: "Extract route definitions into domain-specific route.ts files.",
      })
    }

    // Check 3: Dead imports in app/route.ts (imports pointing to non-existent files)
    for (const importDecl of routeSourceFile.getImportDeclarations()) {
      const specifier = importDecl.getModuleSpecifierValue()
      if (!specifier.startsWith(".")) continue
      const resolvedBase = stripExtension(resolve(dirname(appRouteFile), specifier))
      if (!existsSync(resolvedBase + ".ts") && !existsSync(resolvedBase)) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "warning",
          message: `app/route.ts imports from a path that does not exist: "${specifier}"`,
          location: { filePath: appRouteFile },
          suggestion: "Remove or fix the import specifier.",
        })
      }
    }

    // Check 4: Unreachable domain workflow candidates
    const allRouteFiles = context.snapshot.sourceFiles
      .map((f) => f.absolutePath)
      .filter((p) => p.endsWith("route.ts"))

    const importedPaths = collectImportedPaths(context, allRouteFiles)

    for (const domain of context.snapshot.domainFolders) {
      const workflowPath = join(domain.absolutePath, "workflow.ts")
      if (!existsSync(workflowPath)) continue

      const normalizedWorkflow = normalizeSep(stripExtension(workflowPath))
      if (!importedPaths.has(normalizedWorkflow)) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "hint",
          message: `${domain.name}/workflow.ts is not imported by any route file — may be unreachable`,
          location: { filePath: workflowPath },
          suggestion: "Verify this workflow is reachable via a route or remove if unused.",
        })
      }
    }

    return diagnostics
  },
}
