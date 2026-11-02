export const authCanAccess = (roles: readonly string[]): boolean => roles.includes("member")
