import { join } from "node:path"
import { existsSync } from "node:fs"
import { SyntaxKind } from "ts-morph"
import type { Diagnostic } from "../../types/diagnostic.js"
import type { Rule, RuleContext } from "../../types/rule.js"
import type { DomainFolder } from "../../types/analysis.js"

const RULE_ID = "infrastructure-boundary"

const ORM_PACKAGES = [
  "@prisma/client",
  "drizzle-orm",
  "typeorm",
  "@mikro-orm/core",
  "sequelize",
  "knex",
  "mongoose",
] as const

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

const isInsideDir = (filePath: string, dir: string): boolean => {
  const nFile = normalizeSep(filePath)
  const nDir = normalizeSep(dir)
  return nFile === nDir || nFile.startsWith(nDir + "/")
}

const isOrmImport = (specifier: string): boolean =>
  (ORM_PACKAGES as readonly string[]).some(
    (pkg) => specifier === pkg || specifier.startsWith(pkg + "/"),
  )

/**
 * Returns true when the parameter's type node is TypeReference (named type, e.g. UserPorts)
 * or FunctionType (e.g. `(user: User) => Promise<void>`).
 * TypeLiteral (inline object types like `{ name: string }`) is intentionally excluded —
 * those are plain data inputs, not ports.
 */
const isPortLikeTypeNode = (typeNode: import("ts-morph").TypeNode | undefined): boolean => {
  if (typeNode === undefined) return false
  const kind = typeNode.getKind()
  return kind === SyntaxKind.TypeReference || kind === SyntaxKind.FunctionType
}

const checkOrmBoundary = (context: RuleContext): readonly Diagnostic[] => {
  const { sourceRoot, domainFolders, sourceFiles } = context.snapshot
  const infrastructureDir = join(sourceRoot, "infrastructure")
  const diagnostics: Diagnostic[] = []

  for (const fileInfo of sourceFiles) {
    // Files inside infrastructure/ are allowed to import ORM
    if (isInsideDir(fileInfo.absolutePath, infrastructureDir)) continue

    const sf =
      context.morphProject.getSourceFile(fileInfo.absolutePath) ??
      context.morphProject.addSourceFileAtPath(fileInfo.absolutePath)

    const ormImports = sf
      .getImportDeclarations()
      .map((i) => i.getModuleSpecifierValue())
      .filter(isOrmImport)

    if (ormImports.length === 0) continue

    const domainOwner = domainFolders.find((d) =>
      isInsideDir(fileInfo.absolutePath, d.absolutePath),
    )

    if (domainOwner !== undefined) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "error",
        message: `${domainOwner.name}/ imports ORM (${ormImports.join(", ")}) directly — domain files must not access the database`,
        location: { filePath: fileInfo.absolutePath },
        suggestion:
          "Define a port in ports.ts and implement it in infrastructure/ using the ORM. Inject the port into workflow.ts.",
      })
    } else {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "error",
        message: `File imports ORM (${ormImports.join(", ")}) outside infrastructure/ — ORM access must be isolated in infrastructure/`,
        location: { filePath: fileInfo.absolutePath },
        suggestion: "Move ORM usage into infrastructure/ and expose only port interfaces to the rest of the codebase.",
      })
    }
  }

  return diagnostics
}

const checkWorkflowPortAcceptance = (context: RuleContext): readonly Diagnostic[] => {
  const diagnostics: Diagnostic[] = []

  const domainsWithPorts = context.snapshot.domainFolders.filter(
    (d): d is DomainFolder & { hasPorts: true } => d.hasPorts,
  )

  for (const domain of domainsWithPorts) {
    const workflowPath = join(domain.absolutePath, "workflow.ts")
    if (!existsSync(workflowPath)) continue

    const sf =
      context.morphProject.getSourceFile(workflowPath) ??
      context.morphProject.addSourceFileAtPath(workflowPath)

    const exportedFunctions = [
      ...sf.getFunctions().filter((f) => f.isExported()),
      ...sf
        .getVariableDeclarations()
        .filter(
          (v) =>
            v.getVariableStatement()?.isExported() === true &&
            (v.getInitializerIfKind(SyntaxKind.ArrowFunction) !== undefined ||
              v.getInitializerIfKind(SyntaxKind.FunctionExpression) !== undefined),
        )
        .map((v) => {
          const init =
            v.getInitializerIfKind(SyntaxKind.ArrowFunction) ??
            v.getInitializerIfKind(SyntaxKind.FunctionExpression)
          return init
        })
        .filter((f): f is NonNullable<typeof f> => f !== undefined),
    ]

    if (exportedFunctions.length === 0) continue

    const anyFunctionHasPortParam = exportedFunctions.some((fn) =>
      fn.getParameters().some((param) => isPortLikeTypeNode(param.getTypeNode())),
    )

    if (!anyFunctionHasPortParam) {
      diagnostics.push({
        ruleId: RULE_ID,
        severity: "hint",
        message: `${domain.name}/workflow.ts has ports.ts but no exported function accepts a function-type or port parameter`,
        location: { filePath: workflowPath },
        suggestion:
          "Inject ports as a parameter (e.g., `createUser(ports: UserPorts) => async (input) => {...}`) to decouple from infrastructure.",
      })
    }
  }

  return diagnostics
}

export const infrastructureBoundaryRule: Rule = {
  id: RULE_ID,
  activateFromLevel: 9,
  check(context: RuleContext): readonly Diagnostic[] {
    return [...checkOrmBoundary(context), ...checkWorkflowPortAcceptance(context)]
  },
}
