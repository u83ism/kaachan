// Violation: shared abstraction (imported by 2+ query files)
import { formatUserName } from "./sharedHelper.js"

export const getUserQuery = async (email: string) => {
  return { id: "123", name: formatUserName("Alice"), email }
}
