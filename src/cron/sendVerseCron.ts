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
    <p>Bom dia! 😄</p>
    <p>Uma palavra para inspirar seu domingo:</p>
    <blockquote>${verse} - ${reference}</blockquote>
    <p>Com carinho,<br><strong>Ministério de Louvor</strong></p>
  `;

  const allEmails = users.map(u => u.email).filter(Boolean);

  await emailService.sendLeaderNotification({
    to: allEmails,
    subject: "📖 Versículo do dia",
    html,
  });

  console.log("Versículo enviado.");
}
