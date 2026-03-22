// Bad: app/ must not own external API calls
export const callPaymentApi = async () => ({ status: "ok" })
