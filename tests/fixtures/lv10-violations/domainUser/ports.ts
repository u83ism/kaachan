export interface UserReadPort {
  findById: (id: string) => Promise<{ id: string; name: string } | null>
}
