export type CreateUserInput = { readonly name: string }

export const parseCreateUser = (body: unknown): CreateUserInput => ({ name: String(body) })
