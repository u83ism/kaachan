export type UserListItem = { readonly id: string; readonly name: string }
export type UserReadPort = {
  readonly list: () => Promise<readonly UserListItem[]>
  readonly findById: (id: string) => Promise<UserListItem | null>
}
