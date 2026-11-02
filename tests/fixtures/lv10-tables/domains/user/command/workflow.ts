import type { UserWritePort } from "./ports.js"

export const createUser = async (port: UserWritePort, name: string): Promise<void> => port.save(name)
