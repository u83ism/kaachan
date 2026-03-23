export type CreateUserInput = {
  readonly name: string
  readonly email: string
}

export const parseCreateUser = (raw: unknown): CreateUserInput => {
  if (typeof raw !== "object" || raw === null) throw new Error("invalid")
  const { name, email } = raw as Record<string, unknown>
  if (typeof name !== "string") throw new Error("name required")
  if (typeof email !== "string") throw new Error("email required")
  return { name, email }
}
