import { existsSync } from "node:fs"
import { join } from "node:path"
import { Node, SyntaxKind } from "ts-morph"
import type { SourceFile } from "ts-morph"
import { LAYER_FILES } from "@u83ism/architecture-rules"
import { loadSourceFile } from "../../analysis/layer-modules.js"
import type { DomainFolder } from "../../types/analysis.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "error-code-missing-prefix",
] as const
type Id = (typeof RULE_IDS)[number]

/** Error codes are UPPER_SNAKE_CASE string literals */
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/

/** `domains/order-item` → `ORDER_ITEM` */
const codePrefixOf = (domainName: string): string =>
  domainName
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toUpperCase()

/** Error code literals in errors.ts: string literals outside import / export specifiers */
const errorCodeLiterals = (sourceFile: SourceFile): readonly Node[] =>
  sourceFile
    .getDescendantsOfKind(SyntaxKind.StringLiteral)
    .filter((lit) => {
      const parent = lit.getParent()
      return (
        !Node.isImportDeclaration(parent) &&
        !Node.isExportDeclaration(parent) &&
        ERROR_CODE_PATTERN.test(lit.getLiteralValue())
      )
    })

const checkDomain = (context: RuleContext, domain: DomainFolder): readonly Finding<Id>[] => {
  const filePath = join(domain.absolutePath, LAYER_FILES.ERRORS)
  if (!existsSync(filePath)) return []

  const prefix = codePrefixOf(domain.name)
  return errorCodeLiterals(loadSourceFile(context.morphProject, filePath))
    .filter((lit) => Node.isStringLiteral(lit) && !lit.getLiteralValue().startsWith(`${prefix}_`))
    .map((lit) => ({
      ruleId: "error-code-missing-prefix",
      message: `domains/${domain.name}/errors.ts: error code ${lit.getText()} lacks the domain prefix ${prefix}_`,
      location: { filePath, line: lit.getStartLineNumber() },
      suggestion: `Prefix the domain's error codes with ${prefix}_ so codes from different domains cannot collide in slime.config.ts.`,
    }))
}

export const errorCodesRule: Rule<Id> = {
  id: "error-codes",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    return context.snapshot.domainFolders.flatMap((d) => checkDomain(context, d))
  },
}
