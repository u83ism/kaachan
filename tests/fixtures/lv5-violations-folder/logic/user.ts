// Bad: logic/ file imports repository directly
import { findOrderById } from "../repository"

export const userCanPlaceOrder = async (orderId: string) => {
  const order = await findOrderById(orderId)
  return order.total >= 0
}
