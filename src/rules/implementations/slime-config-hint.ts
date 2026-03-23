import { join } from "node:path"
import { existsSync } from "node:fs"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "slime-config-hint"

export const slimeConfigHintRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 5,
  check(context: RuleContext): readonly Diagnostic[] {
    if (existsSync(join(context.snapshot.rootDir, "slime.config.ts"))) return []

    return [
      {
        ruleId: RULE_ID,
        severity: "hint",
        message: "slime.config.ts not found — create it to map DomainError strings to HTTP status codes",
        location: { filePath: context.snapshot.rootDir },
        suggestion:
          "Add an errors map: export default { errors: { USER_ALREADY_EXISTS: 409, NOT_FOUND: 404 } }",
      },
    ]
  },
}
