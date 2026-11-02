import type { UserReadPort, UserListItem } from "./ports.js"
// Violation: the query side imports the WritePort
import type { UserWritePort } from "../command/ports.js"

export const userList = async (
  port: UserReadPort,
  writePort: UserWritePort,
): Promise<readonly UserListItem[]> => {
  // Violation: a query writes
  await writePort.save("last-viewed")
  return port.list()
}
