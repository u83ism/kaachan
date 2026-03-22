// Bad: parse.ts must not access DB directly
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const parseCreateUser = async (input: unknown) => {
  const existing = await prisma.user.findUnique({ where: { email: (input as any).email } })
  return { email: (input as any).email, exists: !!existing }
}
