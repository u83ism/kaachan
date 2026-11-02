// ports.ts defines the infrastructure port interface for domains/user
export interface UserPorts {
  saveUser: (user: { id: string; name: string; email: string }) => Promise<void>
  findUserById: (id: string) => Promise<{ id: string; name: string; email: string } | null>
}
