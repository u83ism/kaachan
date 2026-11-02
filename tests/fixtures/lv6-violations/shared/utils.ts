// Bad: shared/ imports from a domain
import type { User } from "../domains/user/index"

export const formatUser = (user: User): string => `${user.name} (${user.id})`
