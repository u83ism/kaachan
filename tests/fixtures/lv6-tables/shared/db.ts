type Model = Record<"findMany" | "findUnique" | "findFirst" | "create" | "update", (args?: unknown) => Promise<unknown>>

export const prisma = {} as { user: Model; userProfile: Model; order: Model; session: Model }

export const db = {} as { insert: (table: unknown) => { values: (v: unknown) => Promise<void> } }
