import { join } from "node:path"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "cross-folder-concerns"

/**
 * External service packages that should not be imported from cross- folders.
 * cross- folders are for transaction orchestration only.
 */
const EXTERNAL_SERVICE_PACKAGES: readonly string[] = [
  "nodemailer",
  "@sendgrid/mail",
  "sendgrid",
  "mailgun-js",
  "@mailgun-js/mailgun.js",
  "axios",
  "@aws-sdk/client-ses",
  "@aws-sdk/client-sns",
  "twilio",
  "stripe",
  "resend",
  "pusher",
  "pusher-js",
  "postmark",
  "@mailchimp/mailchimp_transactional",
]

const isExternalServicePackage = (specifier: string): boolean => {
  if (specifier.startsWith(".")) return false
  return EXTERNAL_SERVICE_PACKAGES.some(
    (pkg) => specifier === pkg || specifier.startsWith(pkg + "/"),
  )
}

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const isInsideDir = (filePath: string, dir: string): boolean => {
  const nFile = normalizeSep(filePath)
  const nDir = normalizeSep(dir)
  return nFile === nDir || nFile.startsWith(nDir + "/")
}

export const crossFolderConcernsRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 8,
  check(context: RuleContext): readonly Diagnostic[] {
    if (context.snapshot.crossFolders.length === 0) return []

    const { sourceRoot, crossFolders, sourceFiles } = context.snapshot
    const diagnostics: Diagnostic[] = []

    for (const cross of crossFolders) {
      const crossDir = join(sourceRoot, cross)

      for (const fileInfo of sourceFiles) {
        if (!isInsideDir(fileInfo.absolutePath, crossDir)) continue

        const sf =
          context.morphProject.getSourceFile(fileInfo.absolutePath) ??
          context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)

        for (const importDecl of sf.getImportDeclarations()) {
          const specifier = importDecl.getModuleSpecifierValue()
          if (!isExternalServicePackage(specifier)) continue

          diagnostics.push({
            ruleId: RULE_ID,
            severity: "warning",
            message: `${cross}/ imports external service package "${specifier}" — cross- folders are for transaction orchestration only`,
            location: { filePath: fileInfo.absolutePath },
            suggestion:
              "Move external API calls to domain events + adapter pattern instead of calling them directly from cross- folders.",
          })
        }
      }
    }

    return diagnostics
  },
}
