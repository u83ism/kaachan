// Bad: Logic layer must not import repository or client directly
import { findUserById } from "./repository"
import { fetchExternalData } from "./client"

export const userCanDoSomething = async (userId: string) => {
  const user = await findUserById(userId)
  const data = await fetchExternalData()
  return { user, data }
}
