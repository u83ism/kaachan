import type { UserWritePort } from "./ports.js"

export type UserCreated = { readonly type: "USER_CREATED"; readonly payload: { readonly userId: string } }
export type UserProfileView = { readonly id: string; readonly displayName: string; readonly orderCount: number }

export const createUserWorkflow = (port: UserWritePort) => async (name: string): Promise<UserCreated> => ({
  type: "USER_CREATED",
  payload: { userId: await port.save(name) },
})

// Violation: a command returns a read-optimized view model
export const renameUserWorkflow = (port: UserWritePort) => async (name: string): Promise<UserProfileView> => ({
  id: await port.save(name),
  displayName: name,
  orderCount: 0,
})
