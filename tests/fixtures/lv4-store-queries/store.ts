import type { Prisma } from "@prisma/client"

export type User = { readonly id: string; readonly name: string }

export type UserFilter = {
  readonly status?: "active" | "suspended"
  readonly orderBy?: "joinedAt" | "name"
}

export type Condition = { readonly column: string; readonly op: "eq" | "in"; readonly value: unknown }

export const findUserById = async (id: string): Promise<User | null> => ({ id, name: "" })

export const findUsersByIds = async (ids: readonly string[]): Promise<Map<string, User>> =>
  new Map(ids.map((id) => [id, { id, name: "" }]))

export const listUsers = async (filter: UserFilter): Promise<readonly User[]> => (filter ? [] : [])

export const listUsersWhere = async (where: Prisma.UserWhereInput): Promise<readonly User[]> =>
  where ? [] : []

export const searchUsers = async (conditions: Record<string, unknown>): Promise<readonly User[]> =>
  conditions ? [] : []
