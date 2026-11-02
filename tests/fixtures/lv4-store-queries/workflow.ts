import type { Context } from "hono"
import { parseCreateUser } from "./parse.js"
import type { CreateUserInput } from "./parse.js"
import { findUserById, findUsersByIds, listUsers } from "./store.js"

export const CreateUserWorkflow = async (input: CreateUserInput): Promise<string> => input.name

export const RawUserWorkflow = async (c: Context): Promise<string> => {
  const input = parseCreateUser(await c.req.json())
  return input.name
}

export const UserNamesWorkflow = async (ids: readonly string[]): Promise<readonly string[]> => {
  const names: string[] = []
  for (const id of ids) {
    const user = await findUserById(id)
    if (user) names.push(user.name)
  }
  return names
}

export const UserMapWorkflow = async (ids: readonly string[]) =>
  Promise.all(ids.map((id) => findUserById(id)))

export const BatchWorkflow = async (ids: readonly string[]) => {
  const byId = await findUsersByIds(ids)
  for (const user of await listUsers({})) {
    byId.get(user.id)
  }
  return byId
}
