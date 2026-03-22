// Violations: inline arrow function handlers — should be extracted to workflow.ts
import { Router } from "express"

const router = Router()

// Violation 1: async arrow function inline handler
router.get("/users", async (req: unknown, res: unknown) => {
  // logic should live in a workflow function
  void req
  void res
})

// Violation 2: regular arrow function inline handler with middleware
router.post("/users", (req: unknown, res: unknown) => {
  // another inline handler
  void req
  void res
})

// Violation 3: function expression inline handler
router.delete("/users/:id", function (req: unknown, res: unknown) {
  void req
  void res
})

export default router
