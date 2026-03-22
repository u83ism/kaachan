// Domain logic (should not be imported by query/ files)
export const validateUser = (name: string): boolean => name.length > 0
