// Violation: domain file imports ORM directly — should use ports.ts instead
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const findUser = async (id: string) => {
  return prisma.user.findUnique({ where: { id } })
}
