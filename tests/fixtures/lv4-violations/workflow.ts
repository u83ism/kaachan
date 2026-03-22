// Bad: imports ORM directly in workflow instead of going through repository.ts
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const CreateUserWorkflow = async (input: { name: string }) => {
  const user = await prisma.user.create({ data: input })
  return user
}
