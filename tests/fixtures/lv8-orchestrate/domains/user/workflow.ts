// Violation: a domain imports a coordinator
import { placeOrder } from "../../orchestrate/order-inventory/workflow.js"

export const registerUserWorkflow = async (userId: string): Promise<void> => placeOrder(userId)
