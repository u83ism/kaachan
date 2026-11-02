import type { UserReadPort } from "./ports.js"

export const userList = async (port: UserReadPort): Promise<readonly string[]> => port.list()
