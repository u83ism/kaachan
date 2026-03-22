// Bad: return type exposes ORM-generated type instead of a plain domain type
import type { User } from "@prisma/client"

// ORM type leaks through the return annotation — should be mapped to a plain type
export const findUserById = async (id: string): Promise<User | null> => {
  return null as unknown as User | null
}

export const listUsers = async (): Promise<User[]> => {
  return [] as User[]
}
