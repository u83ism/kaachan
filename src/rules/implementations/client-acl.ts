import { join, dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "client-direct-import",
] as const
type Id = (typeof RULE_IDS)[number]

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const stripExtension = (p: string): string => p.replace(/\.(ts|js)$/, "")

export const clientAclRule: Rule<Id> = {
  id: "client-acl",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const clientFilePath = join(context.snapshot.sourceRoot, "client", "client.ts")
    if (!existsSync(clientFilePath)) return []

    const adapterFilePath = join(context.snapshot.sourceRoot, "client", "adapter.ts")
    const normalizedClientPath = normalizeSep(stripExtension(clientFilePath))
    const normalizedAdapterPath = normalizeSep(adapterFilePath)

    const diagnostics: Finding<Id>[] = []

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
          ruleId: "client-direct-import",
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
