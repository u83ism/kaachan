// OK: infrastructure/ is the only place allowed to import ORM
import { PrismaClient } from "@prisma/client"
import type { UserPorts } from "../domainUser/ports.js"

const prisma = new PrismaClient()

export const createUserRepo = (): UserPorts => ({
  saveUser: async (user) => {
    await prisma.user.create({ data: user })
  },
  findUserById: async (id) => {
    return prisma.user.findUnique({ where: { id } })
  },
})
