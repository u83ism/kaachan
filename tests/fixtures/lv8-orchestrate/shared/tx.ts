export const withTransaction = async <T>(fn: () => Promise<T>): Promise<T> => fn()

export const defer = (fn: () => unknown): void => {
  void fn
}
