// App layer must not own DB access — this should be in a domain or shared/store.ts
export const findUser = (id: string) => ({ id, name: "Alice" })
