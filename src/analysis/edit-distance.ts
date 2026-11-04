/**
 * Damerau–Levenshtein distance (optimal string alignment): the number of insertions,
 * deletions, substitutions and transpositions of two adjacent characters that turn `a` into `b`.
 */
export const damerauLevenshtein = (a: string, b: string): number => {
  const initial: readonly number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  const rows = [...a].reduce(
    (acc, ca, x) => {
      const i = x + 1
      const row = [...b].reduce<readonly number[]>(
        (cur, cb, y) => {
          const j = y + 1
          const cost = ca === cb ? 0 : 1
          const edited = Math.min(
            (acc.prev[j] ?? 0) + 1,
            (cur[j - 1] ?? 0) + 1,
            (acc.prev[j - 1] ?? 0) + cost,
          )
          const transposed =
            i > 1 && j > 1 && ca === b[j - 2] && a[i - 2] === cb ? (acc.prevPrev[j - 2] ?? 0) + 1 : edited
          return [...cur, Math.min(edited, transposed)]
        },
        [i],
      )
      return { prevPrev: acc.prev, prev: row }
    },
    { prevPrev: initial, prev: initial },
  )
  return rows.prev[b.length] ?? 0
}
