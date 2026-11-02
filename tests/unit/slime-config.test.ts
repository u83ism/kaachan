import { describe, it, expect } from "vitest"
import { Project } from "ts-morph"
import { parseSlimeConfig } from "../../src/core/slime-config.js"

const parse = (code: string): ReturnType<typeof parseSlimeConfig> => {
  const project = new Project({ useInMemoryFileSystem: true })
  return parseSlimeConfig(project.createSourceFile("slime.config.ts", code), "slime.config.ts")
}

describe("parseSlimeConfig", () => {
  it("reads domains and tables from an object literal default export", () => {
    const result = parse(`
      export default {
        errors: { USER_NOT_FOUND: 404 },
        domains: { auth: [], user: ['auth'], "order-item": ['auth', 'user'] },
        tables: { user: ['user', 'userProfile'] },
      }
    `)
    expect(result).toEqual({
      ok: true,
      value: {
        kind: "found",
        filePath: "slime.config.ts",
        domains: { auth: [], user: ["auth"], "order-item": ["auth", "user"] },
        tables: { user: ["user", "userProfile"] },
      },
    })
  })

  it("leaves undeclared sections undefined", () => {
    const result = parse(`export default { errors: { NOT_FOUND: 404 } }`)
    expect(result.ok && result.value.kind === "found" && result.value.domains).toBe(undefined)
    expect(result.ok && result.value.kind === "found" && result.value.tables).toBe(undefined)
  })

  it("follows defineConfig(), satisfies and variables in the same file", () => {
    const result = parse(`
      const user = ['auth'] as const
      const domains = { auth: [], user } satisfies Record<string, readonly string[]>
      export default defineConfig({ domains })
    `)
    expect(result.ok && result.value.kind === "found" && result.value.domains).toEqual({
      auth: [],
      user: ["auth"],
    })
  })

  it("follows an identifier default export", () => {
    const result = parse(`
      const config = { domains: { auth: [] } }
      export default config
    `)
    expect(result.ok && result.value.kind === "found" && result.value.domains).toEqual({ auth: [] })
  })

  it("fails when a dependency list is not an array of string literals", () => {
    const result = parse(`
      import { upstream } from "./upstream"
      export default { domains: { user: upstream } }
    `)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain('"domains.user" must be an array of string literals')
  })

  it("fails when the default export cannot be read statically", () => {
    const result = parse(`export default loadConfig()`)
    expect(result.ok).toBe(false)
    expect(!result.ok && result.error).toContain("default export must be an object literal")
  })
})
