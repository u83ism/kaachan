// Violation: command/ imports from query/ — CQRS boundary violation
import { getUserQuery } from "../query/getUserQuery.js"

export const createUser = async (input: { name: string; email: string }) => {
  // Wrong: checking query side from command side
  const existing = await getUserQuery(input.email)
  if (existing !== null) throw new Error("User already exists")
  return { id: "new-id", ...input }
}
