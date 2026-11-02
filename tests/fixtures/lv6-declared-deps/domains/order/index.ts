// OK: order → user and order → auth are declared
import type { Session } from "../auth/index.js"
import type { User } from "../user/index.js"

export type Order = { readonly id: string; readonly user: User; readonly session: Session }
