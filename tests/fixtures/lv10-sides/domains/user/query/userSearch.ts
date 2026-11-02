import type { UserListItem, UserReadPort } from "./ports.js"

// Violation: two queries in one file
export const userSearch = async (port: UserReadPort): Promise<readonly UserListItem[]> => port.list()

export const userCount = async (port: UserReadPort): Promise<number> => (await port.list()).length
