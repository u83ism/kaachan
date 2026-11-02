import { findUser } from "../domains/user/workflow.js"
import { placeOrder } from "../domains/order/workflow.js"

export const checkoutWorkflow = async (userId: string): Promise<string> => placeOrder(await findUser(userId))
