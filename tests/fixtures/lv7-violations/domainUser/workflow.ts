// OK: parent domain imports its own nested subdomain
import { formatUserName } from "./core/utils.js"

export const getUser = (): { name: string } => ({ name: formatUserName("Alice") })
