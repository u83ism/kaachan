// Clean events.ts: all types have discriminant fields and no class type properties

export interface UserCreatedEvent {
  readonly type: "USER_CREATED"
  readonly userId: string
  readonly name: string
  readonly createdAt: string // ISO timestamp string, not Date
}

export interface OrderCompletedEvent {
  readonly type: "ORDER_COMPLETED"
  readonly orderId: string
  readonly completedAt: string // ISO timestamp string, not Date
}

export type PaymentProcessedEvent = {
  readonly type: "PAYMENT_PROCESSED"
  readonly paymentId: string
  readonly amount: number
}
