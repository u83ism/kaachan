// Violation: app/ layer imports ORM directly — must go through infrastructure/
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const getDb = (): PrismaClient => prisma
