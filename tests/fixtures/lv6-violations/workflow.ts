// Bad: workflow.ts (outside app/) imports from a domain directly
import type { User } from "./domainUser/index"

export const handleWorkflow = (user: User) => user
