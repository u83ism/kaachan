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

class DomainError extends Error {}

// Good at Lv3: a business rejection as a typed DomainError
export const renameUserWorkflow = async (name: string) => {
  if (name === "admin") {
    throw new DomainError("USER_NAME_RESERVED")
  }
}
