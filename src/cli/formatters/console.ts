import type { AnalysisResult } from "../../types/config.js"

export const formatLevel = (result: AnalysisResult): string => {
  const lines: string[] = []
  lines.push(`Architecture Level: Lv${result.level}`)

  if (result.levelEvidence.length > 0) {
    lines.push("")
    lines.push("Evidence:")
    for (const e of result.levelEvidence) {
      lines.push(`  ✓ ${e}`)
    }
  }

  if (result.missingForNext.length > 0) {
    lines.push("")
    lines.push(`Missing for Lv${result.level + 1}:`)
    for (const m of result.missingForNext) {
      lines.push(`  • ${m}`)
    }
  }

  return lines.join("\n")
}

export const formatDiagnostics = (result: AnalysisResult): string => {
  if (result.diagnostics.length === 0) {
    return `Lv${result.level} — No issues found.`
  }

  const lines: string[] = [`Lv${result.level}`]
  for (const d of result.diagnostics) {
    const loc = d.location.line != null
      ? `${d.location.filePath}:${d.location.line}`
      : d.location.filePath
    const prefix =
      d.severity === "error" ? "✗" : d.severity === "warning" ? "⚠" : "ℹ"
    lines.push(`${prefix} [${d.ruleId}] ${d.message}`)
    lines.push(`  at ${loc}`)
    for (const detail of d.details ?? []) {
      lines.push(`    ${detail}`)
    }
    if (d.suggestion != null) {
      lines.push(`  → ${d.suggestion}`)
    }
  }

  return lines.join("\n")
}
