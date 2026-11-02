import { Hono } from "hono"
import { CreateUserWorkflow } from "./workflow.js"

const route = new Hono() as unknown as {
  group: (opts: { prefix: string }, fn: (r: typeof route) => void) => void
  get: (path: string, handler: unknown) => void
  post: (path: string, handler: unknown) => void
}

route.group({ prefix: "/api" }, (r) => {
  r.post("/users", CreateUserWorkflow)
})
route.get("/health", () => ({ ok: true }))
route.get("/orders", CreateUserWorkflow)
route.post("/api/payments", CreateUserWorkflow)
