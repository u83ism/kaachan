// Clean events.ts: all types have discriminant fields and no class type properties

export interface UserCreatedEvent {
  readonly type: "user.created"
  readonly userId: string
  readonly name: string
  readonly createdAt: string // ISO timestamp string, not Date
}

export interface OrderCompletedEvent {
  readonly type: "order.completed"
  readonly orderId: string
  readonly completedAt: string // ISO timestamp string, not Date
}

export type PaymentProcessedEvent = {
  readonly type: "payment.processed"
  readonly paymentId: string
  readonly amount: number
}
