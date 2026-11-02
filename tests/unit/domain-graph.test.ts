import { describe, it, expect } from "vitest"
import { findDependencyCycles } from "../../src/analysis/domain-graph.js"

describe("findDependencyCycles", () => {
  it("finds nothing in a DAG", () => {
    expect(findDependencyCycles({ auth: [], user: ["auth"], order: ["auth", "user"] })).toEqual([])
  })

  it("reports each cycle once, starting at its alphabetically first domain", () => {
    expect(findDependencyCycles({ auth: [], user: ["auth", "order"], order: ["user"] })).toEqual([
      ["order", "user", "order"],
    ])
  })

  it("reports a self-dependency and a longer cycle", () => {
    expect(
      findDependencyCycles({ a: ["b"], b: ["c"], c: ["a"], legacy: ["legacy"], free: ["a"] }),
    ).toEqual([["a", "b", "c", "a"], ["legacy", "legacy"]])
  })

  it("follows dependencies on domains that are not keys", () => {
    expect(findDependencyCycles({ user: ["external"] })).toEqual([])
  })
})
