// Bad: Logic layer must not import store or client directly
import { findUserById } from "./store"
import { fetchExternalData } from "./client"

export const userCanDoSomething = async (userId: string) => {
  const user = await findUserById(userId)
  const data = await fetchExternalData()
  return { user, data }
}
