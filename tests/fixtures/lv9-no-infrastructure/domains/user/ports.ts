// Mid-migration to Ports & Adapters: the port exists, but infrastructure/ does not yet
export type User = { readonly id: string; readonly name: string }

export type UserPort = {
  readonly save: (name: string) => Promise<User>
}
