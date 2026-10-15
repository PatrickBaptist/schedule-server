import { Resend } from "resend";

export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  async sendIndividualNotifications(data: {
    recipients: Array<{ email: string }>;
    subject: string;
    html: string;
  }) {
    let sent = 0;
    let failed = 0;
    let firstFailure: string | undefined;
    for (const recipient of data.recipients) {
      try {
        const result = await this.resend.emails.send({
          from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
          to: recipient.email,
          subject: data.subject,
          html: data.html,
        });
        if (result.error) {
          failed += 1;
          firstFailure ??= result.error.message;
          console.error("Falha do provedor ao enviar e-mail:", result.error.name, result.error.message);
        } else sent += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Erro desconhecido no provedor de e-mail";
        firstFailure ??= message;
        console.error("Exceção ao enviar e-mail:", message);
      }
    }
    return { sent, failed, firstFailure };
  }

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
