// Bad: workflow.ts (outside app/) imports from a domain directly
import type { User } from "./domains/user/index"

export const handleWorkflow = (user: User) => user
