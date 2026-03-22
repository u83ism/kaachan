import { join } from "node:path"
import { existsSync } from "node:fs"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_ID = "app-layer"

export const appLayerRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 6,
  check(context: RuleContext): readonly Diagnostic[] {
    if (!context.snapshot.hasAppFolder) return []

    const appDir = join(context.snapshot.sourceRoot, "app")
    const diagnostics: Diagnostic[] = []

    const appRepo = join(appDir, "repository.ts")
    if (existsSync(appRepo)) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "warning",
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
    }

    return diagnostics
  },
}
