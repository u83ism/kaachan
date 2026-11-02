type Model = Record<"findMany" | "create", (args?: unknown) => Promise<unknown>>

export const prisma = {} as { user: Model; order: Model }
