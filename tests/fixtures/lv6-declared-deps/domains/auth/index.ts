// Violation: auth → order is not declared (auth declares no dependencies)
import type { Order } from "../order/index.js"

export type Session = { readonly userId: string; readonly lastOrder?: Order }
