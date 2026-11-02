export type User = { readonly id: string; readonly name: string }

export const createUser = (id: string, name: string): User => ({ id, name })
