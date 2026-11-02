import type { UserListItem, UserReadPort } from "./ports.js"

export const userDetail = async (port: UserReadPort, id: string): Promise<UserListItem | null> => port.findById(id)
