import { db, prisma } from "../../shared/db.js"
import { auditLog } from "../../shared/schema.js"

const cache = new Map<string, unknown>()

export const createOrder = async (userId: string): Promise<unknown> => {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const again = await prisma.user.findUnique({ where: { id: userId } })
  await db.insert(auditLog).values({ userId })
  cache.delete(userId)
  return prisma.order.create({ data: { userId, user, again } })
}

export const listProfiles = async (): Promise<unknown> => prisma.userProfile.findMany()
