import { join, resolve, dirname } from "node:path"
import { existsSync } from "node:fs"
import { isInsideDir } from "../../analysis/layer-modules.js"
import { measureFile } from "../../analysis/line-counter.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "app-owns-store",
  "app-owns-client",
  "app-owns-logic",
  "orchestrate-imports-app",
  "app-size",
] as const
type Id = (typeof RULE_IDS)[number]

/** app/route.ts has its own size rule (app-route-size, in fat-routing) */
const APP_ROUTE_FILE = "route.ts"

/** Files in app/ (other than route.ts) longer than the warning threshold */
const checkAppSize = (context: RuleContext, appDir: string): readonly Finding<Id>[] => {
  const { warningLines } = context.config.thresholds
  return context.snapshot.sourceFiles
    .filter((f) => isInsideDir(f.absolutePath, appDir) && f.absolutePath !== join(appDir, APP_ROUTE_FILE))
    .flatMap((f) => {
      const metrics = measureFile(context.morphProject, f.absolutePath)
      if (!metrics.ok || metrics.value.lineCount <= warningLines) return []
      return [
        {
          ruleId: "app-size" as const,
          message: `${f.relativePath} is too large (${metrics.value.lineCount} lines) — the App layer should only aggregate and coordinate`,
          location: { filePath: f.absolutePath },
          suggestion:
            "Move domain-specific work into the domains, and give coordination that keeps growing its own orchestrate/ folder (Lv7).",
        },
      ]
    })
}

export const appLayerRule: Rule<Id> = {
  id: "app-layer",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    if (!context.snapshot.hasAppFolder) return []

    const sourceRoot = context.snapshot.sourceRoot
    const appDir = join(sourceRoot, "app")
    const diagnostics: Finding<Id>[] = []

    const appStore = join(appDir, "store.ts")
    if (existsSync(appStore)) {
      diagnostics.push({
        ruleId: "app-owns-store",
        message: `app/store.ts exists — App layer must not own DB access`,
        location: { filePath: appStore },
        suggestion: "Move DB access to a domain store.ts or shared/store.ts.",
      })
    }

    const appClient = join(appDir, "client.ts")
    if (existsSync(appClient)) {
      diagnostics.push({
        ruleId: "app-owns-client",
        message: `app/client.ts exists — App layer must not own external API calls`,
        location: { filePath: appClient },
        suggestion: "Move to client/client.ts with an adapter.ts ACL boundary.",
      })
    }

    const appLogic = join(appDir, "logic.ts")
    if (existsSync(appLogic)) {
      diagnostics.push({
        ruleId: "app-owns-logic",
        message: `app/logic.ts exists — App layer must not contain business logic`,
        location: { filePath: appLogic },
        suggestion: "Move business logic into the appropriate domain's logic.ts.",
      })
    }

    // orchestrate/*/ importing app/: coordinators must not depend on the App layer
    for (const coordinator of context.snapshot.orchestrateFolders) {
      const coordinatorDir = coordinator.absolutePath
      for (const fileInfo of context.snapshot.sourceFiles) {
        if (!isInsideDir(fileInfo.absolutePath, coordinatorDir)) continue
        const sf =
          context.morphProject.getSourceFile(fileInfo.absolutePath) ??
          context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)
        for (const importDecl of sf.getImportDeclarations()) {
          const specifier = importDecl.getModuleSpecifierValue()
          if (!specifier.startsWith(".")) continue
          const resolvedImport = resolve(dirname(fileInfo.absolutePath), specifier)
          if (isInsideDir(resolvedImport, appDir)) {
            diagnostics.push({
              ruleId: "orchestrate-imports-app",
              message: `orchestrate/${coordinator.name}/ imports from app/ — orchestrate/ folders must not depend on the App layer`,
              location: { filePath: fileInfo.absolutePath },
              suggestion:
                "Use domain events or shared/ instead of importing from app/ directly.",
            })
          }
        }
      }
    }

    return [...diagnostics, ...checkAppSize(context, appDir)]
  },
}
