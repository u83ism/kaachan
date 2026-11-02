import type { UserPort } from "../../domains/user/ports.js"

export const prismaUserPort: UserPort = {
  findByIds: async () => new Map(),
  save: async (name) => ({ id: "1", name }),
}
