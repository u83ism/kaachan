export type User = { readonly id: string; readonly name: string }

export type UserPort = {
  readonly findByIds: (ids: readonly string[]) => Promise<Map<string, User>>
  readonly save: (name: string) => Promise<User>
}

// Violation: implementation code in ports.ts
export const toUser = (id: string, name: string): User => ({ id, name })
