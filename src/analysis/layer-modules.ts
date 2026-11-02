import { basename, dirname, resolve } from "node:path"
import { Node, SyntaxKind } from "ts-morph"
import type {
  ArrowFunction,
  FunctionDeclaration,
  FunctionExpression,
  ImportDeclaration,
  Project,
  SourceFile,
} from "ts-morph"

export const loadSourceFile = (morphProject: Project, filePath: string): SourceFile =>
  morphProject.getSourceFile(filePath) ?? morphProject.addSourceFileAtPath(filePath)

/** ORM / DB client packages. Subpath imports (e.g. `drizzle-orm/pg-core`) count too */
export const ORM_PACKAGES = [
  "@prisma/client",
  "drizzle-orm",
  "typeorm",
  "@mikro-orm/core",
  "sequelize",
  "knex",
  "mongoose",
] as const

export const isOrmImport = (specifier: string): boolean =>
  ORM_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))

/** Last segment of an import specifier without its extension, e.g. `../store.js` → `store` */
export const lastSegment = (specifier: string): string =>
  specifier.replace(/\.(js|ts)$/, "").split("/").at(-1) ?? ""

/** Whether a relative specifier points at a layer module or into its folder (`./parse.js`, `./parse/user.js`) */
export const isRelativeLayerImport = (specifier: string, layer: string): boolean =>
  specifier.startsWith(".") && specifier.replace(/\.(js|ts)$/, "").split("/").includes(layer)

/** Whether the file sits in a promotion folder (e.g. `logic/user.ts`) rather than being the single layer file */
export const isInFolder = (filePath: string, folderName: string): boolean =>
  basename(dirname(filePath)) === folderName

/** Local names an import declaration binds (aliases, default and namespace imports included) */
export const importedNames = (decl: ImportDeclaration): readonly string[] => [
  ...decl.getNamedImports().map((n) => n.getAliasNode()?.getText() ?? n.getName()),
  ...[decl.getDefaultImport(), decl.getNamespaceImport()].flatMap((n) => (n ? [n.getText()] : [])),
]

/** Local names bound by the file's imports whose specifier matches */
export const namesImportedFrom = (
  sourceFile: SourceFile,
  matches: (specifier: string) => boolean,
): ReadonlySet<string> =>
  new Set(
    sourceFile
      .getImportDeclarations()
      .filter((d) => matches(d.getModuleSpecifierValue()))
      .flatMap(importedNames),
  )

/** Identifier uses, excluding property names (`res.json` does not use a variable named `json`) */
export const usedIdentifiers = (node: Node): readonly string[] =>
  node
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .filter((id) => {
      const parent = id.getParent()
      return !(Node.isPropertyAccessExpression(parent) && parent.getNameNode() === id)
    })
    .map((id) => id.getText())

export interface ExportedFunction {
  readonly name: string
  readonly line: number
  /** The function declaration, or the arrow function / function expression a variable is initialized with */
  readonly node: FunctionDeclaration | ArrowFunction | FunctionExpression
}

/** Exported function declarations and exported variables initialized with a function */
export const exportedFunctions = (sourceFile: SourceFile): readonly ExportedFunction[] => [
  ...sourceFile.getFunctions().flatMap((f) => {
    const name = f.getName()
    return f.isExported() && name !== undefined ? [{ name, line: f.getStartLineNumber(), node: f }] : []
  }),
  ...sourceFile.getVariableDeclarations().flatMap((v) => {
    const init = v.getInitializer()
    const isFunction = Node.isArrowFunction(init) || Node.isFunctionExpression(init)
    return v.getVariableStatement()?.isExported() === true && isFunction
      ? [{ name: v.getName(), line: v.getStartLineNumber(), node: init }]
      : []
  }),
]

const normalizeSep = (p: string): string => p.replace(/\\/g, "/")

/** Whether the path is the directory itself or inside it */
export const isInsideDir = (filePath: string, dir: string): boolean => {
  const nFile = normalizeSep(filePath)
  const nDir = normalizeSep(dir)
  return nFile === nDir || nFile.startsWith(`${nDir}/`)
}

export interface RelativeImport {
  readonly specifier: string
  /** Absolute path the specifier points at, without resolving the extension */
  readonly resolved: string
  readonly line: number
}

/** Relative imports of a file, resolved against its directory */
export const relativeImports = (sourceFile: SourceFile, filePath: string): readonly RelativeImport[] =>
  sourceFile.getImportDeclarations().flatMap((decl) => {
    const specifier = decl.getModuleSpecifierValue()
    return specifier.startsWith(".")
      ? [{ specifier, resolved: resolve(dirname(filePath), specifier), line: decl.getStartLineNumber() }]
      : []
  })

/** External service packages (mail, notifications, payments, HTTP clients): non-DB I/O that cannot be rolled back */
export const EXTERNAL_SERVICE_PACKAGES = [
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
] as const

export const isExternalServicePackage = (specifier: string): boolean =>
  EXTERNAL_SERVICE_PACKAGES.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))
