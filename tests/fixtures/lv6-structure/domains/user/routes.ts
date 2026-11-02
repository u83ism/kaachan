type Router = { get: (path: string, handler: unknown, options?: unknown) => void }

const ListUsersWorkflow = async (): Promise<readonly string[]> => []

export const userRoutes = (r: Router): void => {
  r.get("/v1/users", ListUsersWorkflow, { deprecated: true, sunset: "2026-09-01" })
  r.get("/v2/users", ListUsersWorkflow, { deprecated: true, sunset: "2027-01-01" })
}
