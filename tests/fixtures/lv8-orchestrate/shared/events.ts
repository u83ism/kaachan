// Violation: shared/events.ts imports a domain
import type { UserId } from "../domains/user/types.js"

export type UserRegisteredEvent = {
  readonly type: "userRegistered"
  readonly payload: { readonly userId: UserId }
}

export type OrderPlacedEvent = {
  readonly type: "ORDER_PLACED"
  readonly payload: { readonly orderId: string }
}
