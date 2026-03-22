// Violation: cross- folder imports an external mail service directly
import nodemailer from "nodemailer"

export const notifyOrderComplete = async (to: string) => {
  const transporter = nodemailer.createTransport({
    host: "smtp.example.com",
    port: 587,
  })
  await transporter.sendMail({ from: "noreply@example.com", to, subject: "Done" })
}
