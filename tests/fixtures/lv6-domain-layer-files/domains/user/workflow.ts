import { fetchUserById } from "./store.js"
import { userIsActive } from "./logic.js"

export const getUser = async (id: string) => {
  const user = await fetchUserById(id)
  return userIsActive(user) ? user : undefined
}
