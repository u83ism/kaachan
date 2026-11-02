import type { UserPort } from "./ports.js"
// Violation: a domain imports infrastructure/
import { prismaUserPort } from "../../infrastructure/user/prismaAdapter.js"

export const createUserWorkflow = (port: UserPort = prismaUserPort) => async (name: string) => port.save(name)
