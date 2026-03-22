import { SyntaxKind, type Project } from "ts-morph"
import type { Result } from "../types/index.js"

export interface FileMetrics {
  readonly filePath: string
  readonly lineCount: number
  readonly functionCount: number
}

export const measureFile = (morphProject: Project, filePath: string): Result<FileMetrics> => {
  try {
    const sourceFile =
      morphProject.getSourceFile(filePath) ?? morphProject.addSourceFileAtPath(filePath)

    const lineCount = sourceFile.getEndLineNumber()

    const declarationCount = sourceFile.getFunctions().length
    const arrowCount = sourceFile
      .getVariableDeclarations()
      .filter(
        (v) =>
          v.getInitializerIfKind(SyntaxKind.ArrowFunction) !== undefined ||
          v.getInitializerIfKind(SyntaxKind.FunctionExpression) !== undefined,
      ).length

    return {
      ok: true,
      value: { filePath, lineCount, functionCount: declarationCount + arrowCount },
    }
  } catch (e) {
    return { ok: false, error: `Failed to measure ${filePath}: ${String(e)}` }
  }
}
