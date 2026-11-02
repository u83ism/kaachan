import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "orchestrate-non-transactional-io",
] as const
type Id = (typeof RULE_IDS)[number]

/**
 * External service packages that should not be imported from orchestrate/ folders.
 * orchestrate/ folders are for transaction orchestration only.
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

export const crossFolderConcernsRule: Rule<Id> = {
  id: "cross-folder-concerns",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    if (context.snapshot.orchestrateFolders.length === 0) return []

    const { orchestrateFolders, sourceFiles } = context.snapshot
    const diagnostics: Finding<Id>[] = []

    for (const coordinator of orchestrateFolders) {
      const coordinatorDir = coordinator.absolutePath

      for (const fileInfo of sourceFiles) {
        if (!isInsideDir(fileInfo.absolutePath, coordinatorDir)) continue

        const sf =
          context.morphProject.getSourceFile(fileInfo.absolutePath) ??
          context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)

        for (const importDecl of sf.getImportDeclarations()) {
          const specifier = importDecl.getModuleSpecifierValue()
          if (!isExternalServicePackage(specifier)) continue

          diagnostics.push({
            ruleId: "orchestrate-non-transactional-io",
            message: `orchestrate/${coordinator.name}/ imports external service package "${specifier}" — orchestrate/ folders are for transaction orchestration only`,
            location: { filePath: fileInfo.absolutePath },
            suggestion:
              "Move external API calls to domain events + adapter pattern instead of calling them directly from orchestrate/ folders.",
          })
        }
      }
    }

    return diagnostics
  },
}
