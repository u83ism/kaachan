import { basename, dirname, join, relative, sep } from "node:path"
import { existsSync } from "node:fs"
import { Node } from "ts-morph"
import type { SourceFile, Statement } from "ts-morph"
import { FOLDER_NAMES, LAYER_FILES } from "@u83ism/architecture-rules"
import { isInsideDir, loadSourceFile, relativeImports } from "../../analysis/layer-modules.js"
import type { DomainFolder } from "../../types/analysis.js"
import type { Finding } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"

const RULE_IDS = [
  "infrastructure-missing",
  "domain-imports-infrastructure",
  "ports-has-implementation",
  "store-remains",
] as const
type Id = (typeof RULE_IDS)[number]

// --- Check 1: no infrastructure/ folder ---

const checkInfrastructureFolder = (context: RuleContext, infrastructureDir: string): readonly Finding<Id>[] =>
  context.snapshot.hasInfrastructureFolder
    ? []
    : [
        {
          ruleId: "infrastructure-missing",
          message: "infrastructure/ does not exist — from Lv9 the port implementations live there",
          location: { filePath: infrastructureDir },
          suggestion: "Create infrastructure/<domain>/ and implement each domain's ports.ts there with the ORM.",
        },
      ]

// --- Check 2: a domain importing infrastructure/ ---

const checkDomainImports = (
  context: RuleContext,
  domain: DomainFolder,
  infrastructureDir: string,
): readonly Finding<Id>[] =>
  context.snapshot.sourceFiles
    .filter((f) => isInsideDir(f.absolutePath, domain.absolutePath))
    .flatMap((f) =>
      relativeImports(loadSourceFile(context.morphProject, f.absolutePath), f.absolutePath)
        .filter((i) => isInsideDir(i.resolved, infrastructureDir))
        .map((i) => ({
          ruleId: "domain-imports-infrastructure" as const,
          message: `domains/${domain.name}/ imports "${i.specifier}" — a domain must not know the implementation of its ports`,
          location: { filePath: f.absolutePath, line: i.line },
          suggestion:
            "Take the port as a workflow argument and inject the infrastructure implementation in app/workflow.ts (the composition root).",
        })),
    )

// --- Check 3: implementation code in ports.ts ---

/** Statements allowed in ports.ts: types, interfaces, imports and re-exports */
const isDeclarationOnly = (stmt: Statement): boolean =>
  Node.isTypeAliasDeclaration(stmt) ||
  Node.isInterfaceDeclaration(stmt) ||
  Node.isImportDeclaration(stmt) ||
  Node.isExportDeclaration(stmt)

const checkPortsFile = (sourceFile: SourceFile, filePath: string, label: string): readonly Finding<Id>[] =>
  sourceFile
    .getStatements()
    .filter((stmt) => !isDeclarationOnly(stmt))
    .map((stmt) => ({
      ruleId: "ports-has-implementation",
      message: `${label} contains implementation code (${stmt.getKindName()}) — ports.ts holds type definitions only`,
      location: { filePath, line: stmt.getStartLineNumber() },
      suggestion: "Keep only the port types here and move the implementation to infrastructure/<domain>/.",
    }))

const portsFilesOf = (domain: DomainFolder): readonly string[] =>
  [domain.absolutePath, join(domain.absolutePath, FOLDER_NAMES.COMMAND), join(domain.absolutePath, FOLDER_NAMES.QUERY)]
    .map((dir) => join(dir, LAYER_FILES.PORTS))
    .filter(existsSync)

const portsLabel = (domain: DomainFolder, filePath: string): string => {
  const sub = basename(dirname(filePath))
  return sub === domain.name ? `domains/${domain.name}/ports.ts` : `domains/${domain.name}/${sub}/ports.ts`
}

// --- Check 4: store.ts still present ---

/** Every store.ts except app/store.ts, which app-owns-store reports */
const checkStoreFiles = (context: RuleContext): readonly Finding<Id>[] => {
  const appDir = join(context.snapshot.sourceRoot, FOLDER_NAMES.APP)
  return context.snapshot.layerFiles.store
    .filter((p) => !isInsideDir(p, appDir))
    .map((filePath) => ({
      ruleId: "store-remains",
      message: `${relative(context.rootDir, filePath).split(sep).join("/")} still exists — from Lv9 store.ts splits into ports.ts and infrastructure/`,
      location: { filePath },
      suggestion:
        "Declare what the domain needs in ports.ts and move the ORM code into an adapter under infrastructure/<domain>/.",
    }))
}

export const portsAdaptersRule: Rule<Id> = {
  id: "ports-adapters",
  ruleIds: RULE_IDS,
  check(context: RuleContext): readonly Finding<Id>[] {
    const { domainFolders, sourceRoot } = context.snapshot
    const infrastructureDir = join(sourceRoot, FOLDER_NAMES.INFRASTRUCTURE)
    return [
      ...checkInfrastructureFolder(context, infrastructureDir),
      ...domainFolders.flatMap((d) => checkDomainImports(context, d, infrastructureDir)),
      ...domainFolders.flatMap((d) =>
        portsFilesOf(d).flatMap((p) => checkPortsFile(loadSourceFile(context.morphProject, p), p, portsLabel(d, p))),
      ),
      ...checkStoreFiles(context),
    ]
  },
}
