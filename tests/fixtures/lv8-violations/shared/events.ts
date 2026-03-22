// Violation: class type defined inline — should not appear in event property types
class UserEntity {
  id: string = ""
  name: string = ""
}

// Violation 1: missing `type` discriminant field
// Violation 2: `entity` property is a class type (UserEntity)
export interface UserCreatedEvent {
  userId: string
  entity: UserEntity
}

// Violation: `completedAt` uses Date (a known class-like type)
export interface OrderCompletedEvent {
  readonly type: "order.completed"
  orderId: string
  completedAt: Date
}

// Violation: type alias without discriminant
export type PaymentProcessedEvent = {
  paymentId: string
  amount: number
}
