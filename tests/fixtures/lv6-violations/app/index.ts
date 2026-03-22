// OK: app/ is the only layer allowed to import from domains
import type { User } from "../domainUser/index"
import type { Order } from "../domainOrder/index"

export const buildResponse = (user: User, order: Order) => ({ user, order })
