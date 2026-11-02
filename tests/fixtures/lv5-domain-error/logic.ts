export const userCanCreate = (exists: boolean): boolean => !exists

export const canEdit = (ownerId: string, userId: string): boolean => ownerId === userId

export function isAdult(age: number): boolean {
  return age >= 18
}

export const calcOrderTotal = (prices: readonly number[]): number => prices.reduce((a, b) => a + b, 0)
