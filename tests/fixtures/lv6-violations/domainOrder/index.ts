// Bad: cross-domain import — domainOrder imports from domainUser
import type { User } from "../domainUser/index"

export type Order = { readonly id: string; readonly user: User; readonly total: number }
