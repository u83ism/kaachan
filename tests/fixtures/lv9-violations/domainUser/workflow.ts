// Violation: ports.ts exists but workflow does not accept port/function-type parameters
export const createUser = async (input: { name: string; email: string }) => {
  // Directly implements logic without injected ports
  return { id: "123", name: input.name, email: input.email }
}

export const getUser = async (id: string) => {
  return { id, name: "Unknown" }
}
