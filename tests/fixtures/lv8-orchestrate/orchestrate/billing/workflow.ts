// Violation from Lv8: a coordinator without withTransaction()
export const chargeOrder = async (orderId: string): Promise<string> => orderId
