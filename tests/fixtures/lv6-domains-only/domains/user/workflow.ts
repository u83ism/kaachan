import { findUserById } from "./store.js"

export const getUser = async (id: string) => findUserById(id)
