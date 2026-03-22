// Violation: app/ must not import from a domain's nested subdomain — use domainUser/index.ts
import { formatUserName } from "../domainUser/core/utils.js"

export const displayUser = (): string => formatUserName("Bob")
