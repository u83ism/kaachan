// Lv10: the ports live in command/ and query/, not directly in the domain folder
export type UserWritePort = { readonly save: (name: string) => Promise<void> }
