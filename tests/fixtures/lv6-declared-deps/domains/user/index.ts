// OK: user → auth is declared
import type { Session } from "../auth/index.js"

export type User = { readonly id: string; readonly session: Session }
