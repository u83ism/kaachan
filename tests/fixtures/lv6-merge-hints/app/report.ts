import { findUser } from "../domains/user/workflow.js"
import { placeOrder } from "../domains/order/workflow.js"
import { charge } from "../domains/billing/workflow.js"

export const reportWorkflow = async (userId: string): Promise<string> => charge(await placeOrder(await findUser(userId)))
