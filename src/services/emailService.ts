import { Resend } from "resend";

export class EmailService {
  private resend = new Resend(process.env.RESEND_API_KEY);

  private getAppUrl() {
    const appUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
    if (!appUrl) throw new Error("APP_URL nao definido");
    return appUrl;
  }

  async sendEmailVerification(data: { to: string; nickname?: string | null; token: string }) {
    const link = `${this.getAppUrl()}/verify-email?token=${encodeURIComponent(data.token)}`;
    const greeting = this.getGreeting(data.nickname);
    const result = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
      to: data.to,
      subject: "Confirme seu cadastro",
      html: `<p>${greeting}</p><p>Para concluir seu cadastro, confirme seu endereço de e-mail:</p><p><a href="${link}">Confirmar meu e-mail</a></p><p>Este link expira em 24 horas. Se você não fez esse cadastro, ignore esta mensagem.</p>`,
    });
    if (result.error) throw new Error("Falha ao enviar e-mail de confirmação");
  }

  async sendWelcomeEmail(data: { to: string; nickname?: string | null }) {
    const link = this.getAppUrl();
    const greeting = this.getGreeting(data.nickname);
    const result = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
      to: data.to,
      subject: "Bem-vindo ao Ministério de Louvor",
      html: `<p>${greeting}</p><p>Seu e-mail foi confirmado e seu cadastro está pronto. 🎉</p><p>Como começar:</p><ul><li><b>Tem um convite?</b> Abra o link que você recebeu, usando este mesmo e-mail, para entrar direto na sua organização.</li><li><b>Ainda não tem convite?</b> Acesse o sistema e crie o seu grupo, igreja ou banda para começar a organizar a agenda musical.</li></ul><p><a href="${link}">Acessar o sistema</a></p>`,
    });
    if (result.error) throw new Error("Falha ao enviar e-mail de boas-vindas");
  }

  async sendAccountDeletedEmail(data: { to: string; nickname?: string | null }) {
    const greeting = this.getGreeting(data.nickname);
    const result = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
      to: data.to,
      subject: "Sua conta foi excluída",
      html: `<p>${greeting}</p><p>Sua conta no Ministério de Louvor foi excluída, conforme solicitado.</p><p>Se você não fez essa solicitação, entre em contato com o suporte.</p>`,
    });
    if (result.error) throw new Error("Falha ao enviar e-mail de exclusão da conta");
  }

  async sendOrganizationDeletedEmail(data: { to: string; nickname?: string | null; organizationName: string }) {
    const greeting = this.getGreeting(data.nickname);
    const organizationName = data.organizationName.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    const result = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
      to: data.to,
      subject: "Uma organização foi excluída",
      html: `<p>${greeting}</p><p>A organização <b>${organizationName}</b> e os dados ligados a ela foram excluídos, conforme solicitado pelo proprietário.</p>`,
    });
    if (result.error) throw new Error("Falha ao enviar e-mail de exclusão da organização");
  }

  async sendOwnershipTransferRequestEmail(data: { to: string; nickname?: string | null; organizationName: string; token: string }) {
    const appUrl = `${this.getAppUrl()}/ownership-transfer?token=${encodeURIComponent(data.token)}`;
    const greeting = this.getGreeting(data.nickname);
    const organizationName = this.escapeHtml(data.organizationName);
    const result = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
      to: data.to,
      subject: "Pedido para se tornar proprietário de uma organização",
      html: `<p>${greeting}</p><p>O proprietário atual pediu para passar a propriedade da organização <b>${organizationName}</b> para você.</p><p>A propriedade só muda depois da sua confirmação.</p><p><a href="${appUrl}">Ver pedido e aceitar ou recusar</a></p><p>Este link expira em 7 dias. Se você não esperava este pedido, pode ignorar este e-mail.</p>`,
    });
    if (result.error) throw new Error("Falha ao enviar e-mail de pedido de propriedade");
  }

  async sendOwnershipTransferResponseEmail(data: { to: string; nickname?: string | null; organizationName: string; accepted: boolean }) {
    const appUrl = `${this.getAppUrl()}/organization-settings`;
    const greeting = this.getGreeting(data.nickname);
    const organizationName = this.escapeHtml(data.organizationName);
    const status = data.accepted ? "aceitou" : "recusado";
    const detail = data.accepted
      ? "Você deixou de ser o proprietário e continua na organização como membro."
      : "Você continua como proprietário da organização.";
    const result = await this.resend.emails.send({
      from: process.env.EMAIL_FROM || "Ministério de Louvor <no-reply@ibmmlouvor.com.br>",
      to: data.to,
      subject: `Pedido de troca de proprietário ${status}`,
      html: `<p>${greeting}</p><p>O pedido para passar a propriedade de <b>${organizationName}</b> foi ${status}.</p><p>${detail}</p><p><a href="${appUrl}">Acessar o sistema</a></p>`,
    });
    if (result.error) throw new Error("Falha ao enviar e-mail com a resposta do pedido de propriedade");
  }

  private escapeHtml(value: string) {
    return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
  }

  private getGreeting(nickname?: string | null) {
    const safeNickname = nickname?.trim().replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
    return safeNickname ? `Olá, ${safeNickname}!` : "Olá!";
  }

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
