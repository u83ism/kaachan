// OK: app/ is the only layer allowed to import from domains
import type { User } from "../domains/user/index"
import type { Order } from "../domains/order/index"

export const buildResponse = (user: User, order: Order) => ({ user, order })
