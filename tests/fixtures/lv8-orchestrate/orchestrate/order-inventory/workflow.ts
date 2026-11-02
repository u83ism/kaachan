import { sendOrderMail } from "../../client/adapter.js"
import { saveOrder } from "../../domains/order/store.js"
import { defer, withTransaction } from "../../shared/tx.js"
// Violation: coordinators import each other
import { chargeOrder } from "../billing/workflow.js"

export const placeOrder = async (userId: string): Promise<void> =>
  withTransaction(async () => {
    const orderId = await saveOrder(userId)
    await sendOrderMail(orderId)
    defer(() => sendOrderMail(orderId))
    await chargeOrder(orderId)
  })
