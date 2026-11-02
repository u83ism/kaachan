// Violation: query/ imports domain logic
import { validateUser } from "../logic.js"

export const getUserDetailQuery = async (id: string) => {
  const name = "Alice"
  if (!validateUser(name)) return null
  return { id, name }
}
