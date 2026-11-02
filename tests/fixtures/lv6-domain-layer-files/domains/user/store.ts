// Violation (store-naming, error at Lv6): "fetch" is not a store prefix
export const fetchUserById = async (id: string) => ({ id, name: "user" })
