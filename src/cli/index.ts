#!/usr/bin/env node
import { program } from "commander"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { resolve, dirname, join } from "node:path"
import { analyze } from "../core/analyzer.js"
import { formatLevel, formatDiagnostics } from "./formatters/console.js"
import { TARGET_IDS, loadRulesTemplate, renderRulesFile, selectTargets } from "./export-rules.js"
import { isLevelDetected } from "../types/config.js"
import type { KaachanConfig } from "../types/config.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
) as { version: string }

const DEFAULT_CONFIG = {
  disabledRules: [] as readonly string[],
  thresholds: {
    hintLines: 300,
    hintFunctions: 10,
    warningLines: 500,
    errorLogicFolderLines: 300,
  },
} satisfies Omit<KaachanConfig, "rootDir">

program
  .name("kaachan")
  .description("Architecture linter for Slime Architecture")
  .version(pkg.version)

program.argument("[path]", "Path to analyze (defaults to current directory)", ".")

program.option("--level", "Show detected architecture level and evidence only")
program.option("--disable-rule <ruleId>", "Disable a specific rule")
program.option("--enable-rule <ruleId>", "Enable an opt-in rule (e.g. defer-suggestion)")

type MainOptions = { level?: boolean; disableRule?: string; enableRule?: string }

program.action(async (pathArg: string, options: MainOptions) => {
  const rootDir = resolve(pathArg)
  const disabledRules = options.disableRule != null ? [options.disableRule] : []
  const enabledRules = options.enableRule != null ? [options.enableRule] : []

  const config: KaachanConfig = {
    ...DEFAULT_CONFIG,
    rootDir,
    disabledRules,
    enabledRules,
  }

  const result = await analyze(config)

  if (!result.ok) {
    console.error(`Error: ${result.error}`)
    process.exit(1)
  }

  if (options.level === true) {
    console.log(formatLevel(result.value))
    return
  }

  console.log(formatDiagnostics(result.value))

  const hasErrors = result.value.diagnostics.some((d) => d.severity === "error")
  if (hasErrors) process.exit(1)
})

const exportRulesCommand = program
  .command("export:rules")
  .description("Generate AI rules files from the detected architecture level")
  .argument("[path]", "Path to analyze (defaults to current directory)", ".")
  .option("--target <target>", `Target tool: ${TARGET_IDS.join(" | ")} (default: all)`)

exportRulesCommand.action(async (pathArg: string, options: { target?: string }) => {
  const rootDir = resolve(pathArg)

  const targets = selectTargets(options.target)
  if (!targets.ok) {
    console.error(`Error: ${targets.error}`)
    process.exit(1)
  }

  const config: KaachanConfig = {
    ...DEFAULT_CONFIG,
    rootDir,
  }

  const result = await analyze(config)

  if (!result.ok) {
    console.error(`Error: ${result.error}`)
    process.exit(1)
  }

  if (!isLevelDetected(result.value)) {
    console.error("Error: no Slime Architecture level detected — rules files are generated per level")
    process.exit(1)
  }

  const template = loadRulesTemplate(result.value.level)
  if (!template.ok) {
    console.error(`Error: ${template.error}`)
    process.exit(1)
  }

  console.log(`Lv${result.value.level} rules:`)
  for (const target of targets.value) {
    const absolutePath = join(rootDir, target.destPath)
    mkdirSync(dirname(absolutePath), { recursive: true })
    writeFileSync(absolutePath, renderRulesFile(template.value, target), "utf8")
    console.log(`  wrote ${target.destPath}`)
  }
})

program.parse()
