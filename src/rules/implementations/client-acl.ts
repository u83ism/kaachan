import { join, dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "client-acl"

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const stripExtension = (p: string): string => p.replace(/\.(ts|js)$/, "")

export const clientAclRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 6,
  check(context: RuleContext): readonly Diagnostic[] {
    const clientFilePath = join(context.snapshot.sourceRoot, "client", "client.ts")
    if (!existsSync(clientFilePath)) return []

    const adapterFilePath = join(context.snapshot.sourceRoot, "client", "adapter.ts")
    const normalizedClientPath = normalizeSep(stripExtension(clientFilePath))
    const normalizedAdapterPath = normalizeSep(adapterFilePath)

    const diagnostics: Diagnostic[] = []

    for (const fileInfo of context.snapshot.sourceFiles) {
      const filePath = fileInfo.absolutePath
      // adapter.ts is the designated accessor — skip
      if (normalizeSep(filePath) === normalizedAdapterPath) continue

      const sourceFile =
        context.morphProject.getSourceFile(filePath) ??
        context.morphProject.addSourceFileAtPath(filePath)

      for (const importDecl of sourceFile.getImportDeclarations()) {
        const specifier = importDecl.getModuleSpecifierValue()
        if (!specifier.startsWith(".")) continue

        const resolved = normalizeSep(stripExtension(resolve(dirname(filePath), specifier)))
        if (resolved !== normalizedClientPath) continue

        diagnostics.push({
          ruleId: RULE_ID,
          severity: "warning",
          message: `Direct import of client/client.ts bypasses the ACL boundary`,
          location: { filePath },
          suggestion:
            "Import from client/adapter.ts instead of client/client.ts directly.",
        })
      }
    }

    return diagnostics
  },
}
