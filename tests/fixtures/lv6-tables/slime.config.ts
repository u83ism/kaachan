export default {
  domains: {
    user: [],
    order: ["user"],
  },
  tables: {
    user: ["user", "userProfile"],
    order: ["order", "orderItem", "userProfile"],
  },
}
