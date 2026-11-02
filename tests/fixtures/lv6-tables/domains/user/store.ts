import { prisma } from "../../shared/db.js"

export const listUsers = async (): Promise<unknown> => prisma.user.findMany()

export const updateOrderStatus = async (id: string): Promise<unknown> =>
  prisma.order.update({ where: { id }, data: { status: "cancelled" } })

export const findSession = async (id: string): Promise<unknown> => prisma.session.findFirst({ where: { id } })
