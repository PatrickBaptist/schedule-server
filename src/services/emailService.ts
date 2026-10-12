import { Resend } from "resend";

export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendLeaderNotification(data: {
    to: string[];
    subject: string;
    html?: string;
  }) {
    if (!data.to.length) return;
    const result = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
      to: data.to[0],
      bcc: data.to.slice(1),
      subject: data.subject,
      html: data.html ?? "",
    });
    if (result.error) throw new Error("Falha ao enviar e-mail");
  }
}
