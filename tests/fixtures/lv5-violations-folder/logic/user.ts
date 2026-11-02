// Bad: logic/ file imports store directly
import { findOrderById } from "../store"

export const userCanPlaceOrder = async (orderId: string) => {
  const order = await findOrderById(orderId)
  return order.total >= 0
}
