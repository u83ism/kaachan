import { join, resolve, dirname } from "node:path"
import { existsSync } from "node:fs"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "app-layer"

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const isInsideDir = (filePath: string, dir: string): boolean => {
  const nFile = normalizeSep(filePath)
  const nDir = normalizeSep(dir)
  return nFile === nDir || nFile.startsWith(nDir + "/")
}

export const appLayerRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 6,
  check(context: RuleContext): readonly Diagnostic[] {
    if (!context.snapshot.hasAppFolder) return []

    const sourceRoot = context.snapshot.sourceRoot
    const appDir = join(sourceRoot, "app")
    const diagnostics: Diagnostic[] = []

    // app/repository.ts: warning at Lv6, error at Lv7+
    const appRepo = join(appDir, "repository.ts")
    if (existsSync(appRepo)) {
      const severity = context.level >= 7 ? "error" : "warning"
      diagnostics.push({
        ruleId: RULE_ID,
        severity,
        message: `app/repository.ts exists — App layer must not own DB access`,
        location: { filePath: appRepo },
        suggestion: "Move DB access to a domain repository or shared/repository.ts.",
      })
    }

    const appClient = join(appDir, "client.ts")
    if (existsSync(appClient)) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "error",
        message: `app/client.ts exists — App layer must not own external API calls`,
        location: { filePath: appClient },
        suggestion: "Move to client/client.ts with an adapter.ts ACL boundary.",
      })
    }

    // app/logic.ts escalates to error only at Lv7+
    if (context.level >= 7) {
      const appLogic = join(appDir, "logic.ts")
      if (existsSync(appLogic)) {
        diagnostics.push({
          ruleId: RULE_ID,
          severity: "error",
          message: `app/logic.ts exists — App layer must not contain business logic`,
          location: { filePath: appLogic },
          suggestion: "Move business logic into the appropriate domain's logic.ts.",
        })
      }

      // cross-*/app/ imports: cross- folders must not depend on the App layer
      for (const cross of context.snapshot.crossFolders) {
        const crossDir = join(sourceRoot, cross)
        for (const fileInfo of context.snapshot.sourceFiles) {
          if (!isInsideDir(fileInfo.absolutePath, crossDir)) continue
          const sf =
            context.morphProject.getSourceFile(fileInfo.absolutePath) ??
            context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)
          for (const importDecl of sf.getImportDeclarations()) {
            const specifier = importDecl.getModuleSpecifierValue()
            if (!specifier.startsWith(".")) continue
            const resolvedImport = resolve(dirname(fileInfo.absolutePath), specifier)
            if (isInsideDir(resolvedImport, appDir)) {
              diagnostics.push({
                ruleId: RULE_ID,
                severity: "error",
                message: `${cross}/ imports from app/ — cross- folders must not depend on the App layer`,
                location: { filePath: fileInfo.absolutePath },
                suggestion:
                  "Use domain events or shared/ instead of importing from app/ directly.",
              })
            }
          }
        }
      }
    }

    return diagnostics
  },
}
