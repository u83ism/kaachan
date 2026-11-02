// Violation: app/ must not import from a domain's nested subdomain — use domains/user/index.ts
import { formatUserName } from "../domains/user/core/utils.js"

export const displayUser = (): string => formatUserName("Bob")
