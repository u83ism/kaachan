// Violation (logic-store-client-import): logic imports an ORM module
import type { User } from "@prisma/client"

export const userIsActive = (user: Pick<User, "name">): boolean => user.name !== ""
