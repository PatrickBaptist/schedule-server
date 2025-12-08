import { EmailService } from "../services/emailService";
import { VerseService } from "../services/verseService";
import { UserService } from "../services/usersService";

export async function runWeeklyVerseJob() {
  const emailService = new EmailService();
  const verseService = new VerseService();
  const userService = new UserService();

  const users = await userService.getAllUsers();
  if (users.length === 0) return;

  const { verse, reference } = await verseService.getVerseOfTheDay();

  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
      <p style="font-size: 16px; margin: 0 0 12px 0;">Bom dia! 😄</p>

      <p style="font-size: 16px; margin: 0 0 12px 0;">
        Que esta Palavra fale ao seu coração hoje:
      </p>

      <blockquote
        style="
          margin: 15px 0;
          padding: 12px 16px;
          border-left: 4px solid #2EBEF2;
          background: #f3f9ff;
          font-size: 15px;
          font-style: italic;
        "
      >
        ${verse} <br />
        <strong style="font-size: 14px;">— ${reference}</strong>
      </blockquote>

      <p style="margin-top: 20px; font-size: 15px;">
        Com carinho,<br>
        <strong>Ministério de Louvor</strong>
      </p>
    </div>
  `;

  const allEmails = users.map(u => u.email).filter(Boolean);

  await emailService.sendLeaderNotification({
    to: allEmails,
    subject: "📖 Versículo do dia",
    html,
  });

  console.log("Versículo enviado.");
}
