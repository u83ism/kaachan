const withTransaction = async <T>(fn: () => Promise<T>): Promise<T> => fn()

export const signUp = async (): Promise<void> => withTransaction(async () => undefined)
