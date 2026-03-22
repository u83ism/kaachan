export interface UserCreatedEvent {
  readonly type: "user.created"
  readonly userId: string
}
