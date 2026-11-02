// Bad: uses non-conventional names (fetch*, retrieve*, load*)
export const fetchUserById = async (id: string) => ({ id, name: "user" })

export const retrieveOrders = async () => [{ id: "1" }]

export const loadProductCatalog = async () => []

// Good: these should not trigger
export const findUserByEmail = async (email: string) => ({ id: "1", email })

export const createUser = async (data: { name: string }) => ({ id: "2", ...data })
