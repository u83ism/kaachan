import { prisma } from "../../shared/db.js"

// Read side: may JOIN across owners in Lv10
export const listOrdersWithUsers = async (): Promise<unknown> => {
  const orders = await prisma.order.findMany()
  const users = await prisma.user.findMany()
  return { orders, users }
}
