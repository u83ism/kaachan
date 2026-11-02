class DomainError extends Error {}

export const CreateUserWorkflow = async (exists: boolean): Promise<string> => {
  if (exists) throw new DomainError("USER_ALREADY_EXISTS")
  return "ok"
}
