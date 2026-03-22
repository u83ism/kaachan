interface UserProfile {
  name: string
}
interface UserOrder {
  total: number
}

// Group A: User domain
export const getUserProfile = (_id: string): UserProfile => ({ name: "" })
export const updateUserProfile = (p: UserProfile): UserProfile => p

// Group B: Order domain
export const getOrderTotal = (_id: string): UserOrder => ({ total: 0 })
export const cancelOrder = (o: UserOrder): UserOrder => o
