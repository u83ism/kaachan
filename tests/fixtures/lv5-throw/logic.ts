// Bad: Logic layer must not throw — return err(...) instead
export const userCanCreate = (exists: boolean): boolean => {
  if (exists) {
    throw new Error("USER_ALREADY_EXISTS")
  }
  return true
}

export const orderCanPlace = (stock: number): boolean => {
  if (stock <= 0) {
    throw new Error("OUT_OF_STOCK")
  }
  return true
}
