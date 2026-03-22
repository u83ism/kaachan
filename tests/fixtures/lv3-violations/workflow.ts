// Bad: workflow.ts parses input inline instead of using parse.ts
export const createUserWorkflow = (rawBody: string) => {
  const input = JSON.parse(rawBody)
  return { name: input.name, email: input.email }
}
