// Bad: workflow uses new Error() directly instead of DomainError pattern
export const createUserWorkflow = async (input: { name: string }) => {
  if (!input.name) {
    throw new Error("NAME_REQUIRED")
  }
  return { id: "1", name: input.name }
}

export const deleteUserWorkflow = async (id: string) => {
  if (!id) {
    throw new Error("ID_REQUIRED")
  }
}
