// Violation: shared abstraction (imports sharedHelper.ts, which is also imported by getUserQuery.ts)
import { formatUserName } from "./sharedHelper.js"

export const listUsersQuery = async () => {
  return [{ id: "1", name: formatUserName("Bob") }]
}
