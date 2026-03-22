// Good: adapter.ts is the designated accessor for client.ts
import { callExternalApi } from "./client"

export const chargePayment = async (amount: number) =>
  callExternalApi({ action: "charge", amount })
