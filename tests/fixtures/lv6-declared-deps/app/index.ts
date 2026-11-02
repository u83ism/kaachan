// OK: app/ may import every domain regardless of the declaration
import type { Order } from "../domains/order/index.js"
import type { User } from "../domains/user/index.js"

export const buildResponse = (user: User, order: Order) => ({ user, order })
