import { handleOrder } from "../domainOrder/workflow.js"
import { missing } from "./non-existent.js"

// Route definitions should live in domain/*/route.ts at Lv6
export const setupRoutes = (app: unknown): void => {
  ;(app as { get: (p: string, h: () => void) => void }).get("/users", () => {})
  ;(app as { post: (p: string, h: () => void) => void }).post("/orders", handleOrder)
}
