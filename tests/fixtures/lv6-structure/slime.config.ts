export default {
  domains: {
    auth: [],
    user: ["auth", "orderItem"],
    orderItem: ["user"],
    legacy: ["legacy"],
  },
}
