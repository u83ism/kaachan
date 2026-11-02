import { FOLDER_NAMES, FOLDER_PATTERNS } from "@u83ism/architecture-rules"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "folder-name-not-kebab-case",
] as const
type Id = (typeof RULE_IDS)[number]

const toKebabCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase()

const checkFolder = (parent: string, folder: { readonly name: string; readonly absolutePath: string }): readonly Finding<Id>[] =>
  FOLDER_PATTERNS.KEBAB_CASE.test(folder.name)
    ? []
    : [
        {
          ruleId: "folder-name-not-kebab-case",
          message: `${parent}/${folder.name}/ is not named in kebab-case`,
          location: { filePath: folder.absolutePath },
          suggestion: `Rename it to ${parent}/${toKebabCase(folder.name)}/ (and the matching keys in slime.config.ts).`,
        },
      ]

export const folderNamesRule: Rule<Id> = {
  id: "folder-names",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { domainFolders, orchestrateFolders } = context.snapshot
    return [
      ...domainFolders.flatMap((d) => checkFolder(FOLDER_NAMES.DOMAINS, d)),
      ...orchestrateFolders.flatMap((o) => checkFolder(FOLDER_NAMES.ORCHESTRATE, o)),
    ]
  },
}
