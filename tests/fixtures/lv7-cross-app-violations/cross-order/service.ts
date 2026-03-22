// cross- folders must not import from app/ — this is a violation
import { setupRoutes } from "../app/route.js"

export const processOrder = (): void => {
  setupRoutes()
}
