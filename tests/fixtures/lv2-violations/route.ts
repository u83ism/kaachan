// Violations: inline handlers that do work other than HTTP I/O (DB calls)
import { Router } from "express"
import { PrismaClient } from "@prisma/client"
import { getUserWorkflow } from "./workflow.js"

const router = Router()
const prisma = new PrismaClient()

// Violation 1: async arrow function handler calls the database
router.get("/users", async (req: unknown, res: { json: (v: unknown) => void }) => {
  void req
  res.json(await prisma.user.findMany())
})

// Violation 2: arrow function handler calls the database
router.post("/users", (req: { body: unknown }, res: unknown) => {
  void res
  return prisma.user.create({ data: req.body })
})

// Violation 3: function expression handler calls the database
router.delete("/users/:id", function (req: { params: { id: string } }, res: unknown) {
  void res
  return prisma.user.delete({ where: { id: req.params.id } })
})

// Allowed: thin handler doing HTTP I/O only (calls a workflow, sets a header)
router.put("/session", async (req: unknown, res: { setHeader: (k: string, v: string) => void }) => {
  const user = await getUserWorkflow(String(req))
  res.setHeader("x-user", String(user))
})

export default router
