// Bad: imports client/client.ts directly instead of going through adapter.ts
import { callExternalApi } from "../client/client"

export const createUserWorkflow = async (name: string) => {
  await callExternalApi({ action: "notify", name })
  return { id: "1", name }
}
