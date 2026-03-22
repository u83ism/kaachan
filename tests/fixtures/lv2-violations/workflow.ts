// Violation: workflow.ts imports auth library directly — should live in middleware.ts
import { verify } from "jsonwebtoken"

export const getUserWorkflow = async (token: string) => {
  const decoded = verify(token, "secret")
  return decoded
}
