import { Resend } from "resend";

export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendLeaderNotification(data: {
    to: string[];
    subject: string;
    html?: string;
  }) {
    await this.resend.emails.send({
      from: "Sistema de Escala <no-reply@ibmmlouvor.com.br>",
      to: data.to,
      subject: data.subject,
      html: data.html ?? "",
    });
  }
}
