import type { DomainDependencies } from "@u83ism/architecture-rules"

const dependenciesOf = (graph: DomainDependencies, domain: string): readonly string[] => graph[domain] ?? []

/** Domains reachable from the domain by following one or more declared dependencies */
const reachableFrom = (graph: DomainDependencies, domain: string): ReadonlySet<string> => {
  const visit = (pending: readonly string[], seen: ReadonlySet<string>): ReadonlySet<string> => {
    const [next, ...rest] = pending
    if (next === undefined) return seen
    if (seen.has(next)) return visit(rest, seen)
    return visit([...rest, ...dependenciesOf(graph, next)], new Set([...seen, next]))
  }
  return visit(dependenciesOf(graph, domain), new Set())
}

/** Shortest path from the domain back to itself, e.g. ["user", "order", "user"] */
const shortestCycle = (graph: DomainDependencies, start: string): readonly string[] => {
  const search = (paths: readonly (readonly string[])[], seen: ReadonlySet<string>): readonly string[] => {
    const [path, ...rest] = paths
    if (path === undefined) return []
    const last = path.at(-1) ?? start
    const deps = dependenciesOf(graph, last)
    if (deps.includes(start)) return [...path, start]
    const fresh = deps.filter((d) => !seen.has(d))
    return search([...rest, ...fresh.map((d) => [...path, d])], new Set([...seen, ...fresh]))
  }
  return search([[start]], new Set([start]))
}

/**
 * Cycles in the domain dependency declaration, one per strongly connected component
 * (a self-dependency counts). Each cycle starts and ends at the alphabetically first member.
 */
export const findDependencyCycles = (graph: DomainDependencies): readonly (readonly string[])[] => {
  const domains = Object.keys(graph).sort()
  const reach = new Map(domains.map((d) => [d, reachableFrom(graph, d)]))
  const cyclic = domains.filter((d) => reach.get(d)?.has(d) === true)
  const components = cyclic.filter(
    (d) => !cyclic.some((other) => other < d && reach.get(d)?.has(other) === true && reach.get(other)?.has(d) === true),
  )
  return components.map((d) => shortestCycle(graph, d))
}
