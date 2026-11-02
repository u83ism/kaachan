import { describe, it, expect } from "vitest"
import { spawnSync } from "node:child_process"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ROOT_DIR = resolve(__dirname, "../..")
const CLI_PATH = resolve(ROOT_DIR, "src/cli/index.ts")
const FIXTURES_DIR = resolve(ROOT_DIR, "tests/fixtures")

type CliResult = { readonly stdout: string; readonly stderr: string; readonly exitCode: number }

const runCli = (args: readonly string[]): CliResult => {
  const result = spawnSync(process.execPath, ["--import", "tsx/esm", CLI_PATH, ...args], {
    encoding: "utf8",
    cwd: ROOT_DIR,
  })
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  }
}

describe("CLI — level detection", () => {
  it("reports that no level was detected and exits 0", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "no-level"), "--level"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("No Slime Architecture level detected")
  })

  it("export:rules exits 1 when no level was detected", () => {
    const { stderr, exitCode } = runCli(["export:rules", resolve(FIXTURES_DIR, "no-level")])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("no Slime Architecture level detected")
  })

  it("detects Lv1 for lv1 fixture", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "lv1"), "--level"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("Architecture Level: Lv1")
    expect(stdout).toContain("route.ts")
  })

  it("detects Lv4 for lv4 fixture", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "lv4"), "--level"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("Architecture Level: Lv4")
  })

  it("detects Lv5 for lv5 fixture", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "lv5"), "--level"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("Architecture Level: Lv5")
  })

  it("detects Lv6 for lv6 fixture", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "lv6"), "--level"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("Architecture Level: Lv6")
  })

  it("shows Missing for next level when not yet reached", () => {
    const { stdout } = runCli([resolve(FIXTURES_DIR, "lv1"), "--level"])
    expect(stdout).toContain("Missing for Lv2")
  })

  it("--level flag exits 0 even when there are rule violations", () => {
    const { exitCode } = runCli([resolve(FIXTURES_DIR, "lv5-violations"), "--level"])
    expect(exitCode).toBe(0)
  })
})

describe("CLI — diagnostic output", () => {
  it("outputs 'No issues found' for a clean project", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "lv5-with-test")])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("No issues found")
  })

  it("exits 0 when diagnostics are only hints/warnings", () => {
    const { exitCode } = runCli([resolve(FIXTURES_DIR, "lv2-violations")])
    expect(exitCode).toBe(0)
  })

  it("shows hint/warning prefix symbols in output", () => {
    const { stdout } = runCli([resolve(FIXTURES_DIR, "lv2-violations")])
    expect(stdout).toMatch(/[ℹ⚠]/)
  })

  it("exits 1 when there are error-severity diagnostics (lv5-violations)", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "lv5-violations")])
    expect(exitCode).toBe(1)
    expect(stdout).toContain("✗")
    expect(stdout).toContain("[logic-store-client-import]")
  })

  it("exits 1 when there are error-severity diagnostics (lv6-violations)", () => {
    const { stdout, exitCode } = runCli([resolve(FIXTURES_DIR, "lv6-violations")])
    expect(exitCode).toBe(1)
    expect(stdout).toContain("[domain-undeclared-import]")
  })
})

describe("CLI — --disable-rule flag", () => {
  it("suppresses a single catalog rule ID", () => {
    const { stdout } = runCli([
      resolve(FIXTURES_DIR, "lv3-violations"),
      "--disable-rule",
      "parse-db-import",
    ])
    expect(stdout).not.toContain("[parse-db-import]")
    expect(stdout).toContain("[workflow-raw-parse]")
  })

  it("suppresses specified rule and exits 0", () => {
    const { exitCode, stdout } = runCli([
      resolve(FIXTURES_DIR, "lv5-violations"),
      "--disable-rule",
      "logic-imports",
    ])
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain("logic-imports")
  })
})

describe("CLI — --enable-rule flag", () => {
  it("reports an opt-in rule only when it is enabled", () => {
    const fixture = resolve(FIXTURES_DIR, "lv8-orchestrate")
    expect(runCli([fixture]).stdout).not.toContain("[defer-suggestion]")
    expect(runCli([fixture, "--enable-rule", "defer-suggestion"]).stdout).toContain("[defer-suggestion]")
  })
})

describe("CLI — error handling", () => {
  it("exits 1 and prints error for non-existent directory", () => {
    const { stderr, exitCode } = runCli(["/nonexistent/kaachan-test-path"])
    expect(exitCode).toBe(1)
    expect(stderr).toContain("Error")
  })

  it("shows version with --version flag", () => {
    const { stdout, exitCode } = runCli(["--version"])
    expect(exitCode).toBe(0)
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("shows help with --help flag", () => {
    const { stdout, exitCode } = runCli(["--help"])
    expect(exitCode).toBe(0)
    expect(stdout).toContain("kaachan")
    expect(stdout).toContain("--level")
  })
})
