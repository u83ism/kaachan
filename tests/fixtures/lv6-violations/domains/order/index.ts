// Bad: cross-domain import — domains/order imports from domains/user
import type { User } from "../user/index"

export type Order = { readonly id: string; readonly user: User; readonly total: number }
