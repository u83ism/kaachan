import { join } from "node:path"
import { existsSync } from "node:fs"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "slime-config-missing",
] as const
type Id = (typeof RULE_IDS)[number]

export const slimeConfigHintRule: Rule<Id> = {
  id: "slime-config-hint",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    if (existsSync(join(context.snapshot.rootDir, "slime.config.ts"))) return []

    return [
      {
        ruleId: "slime-config-missing",
        message: "slime.config.ts not found — create it to map DomainError strings to HTTP status codes",
        location: { filePath: context.snapshot.rootDir },
        suggestion:
          "Add an errors map: export default { errors: { USER_ALREADY_EXISTS: 409, NOT_FOUND: 404 } }",
      },
    ]
  },
}
