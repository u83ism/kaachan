// Bad: calls prisma.$transaction() directly — use slime.withTransaction() instead
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const createUserWithAuditWorkflow = async (input: { name: string }) => {
  return prisma.$transaction([
    prisma.user.create({ data: input }),
    prisma.auditLog.create({ data: { action: "USER_CREATED" } }),
  ])
}
