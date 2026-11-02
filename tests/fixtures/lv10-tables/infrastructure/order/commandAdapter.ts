import { prisma } from "../../shared/db.js"

export const saveOrder = async (userId: string): Promise<unknown> => {
  const users = await prisma.user.findMany({ where: { id: userId } })
  return prisma.order.create({ data: { userId, users } })
}
