import { UserService } from "../services/usersService";
import { EmailService } from "../services/emailService";
import { MusicService } from "../services/musicService";

export async function runWeeklyMusicJob() {
  const userService = new UserService();
  const emailService = new EmailService();
  const musicService = new MusicService();

  const users = await userService.getAllUsers();
  if (users.length === 0) return;

  const musicLinks = await musicService.fetchWeeklyMusicLinks();
  if (musicLinks.length === 0) return;

  let musicListHtml = "<ul>";
  musicLinks.forEach(m => {
    musicListHtml += `<li>
      <strong>${m.name}</strong>
      ${m.cifra ? ` - Tom: ${m.cifra}` : ""}
      ${m.minister ? ` (${m.minister})` : ""}
      ${m.link ? `<br><a href="${m.link}" target="_blank">▶ Assistir</a>` : ""}
    </li>`;
  });
  musicListHtml += "</ul>";

  const html = `
    <h2>Olá pessoal!</h2>
    <p>Estudem as músicas para o próximo culto:</p>
    ${musicListHtml}
    <p>Com carinho,<br><strong>Ministério de Louvor</strong></p>
  `;

  const allEmails = users.map(u => u.email).filter(Boolean);

  await emailService.sendLeaderNotification({
    to: allEmails,
    subject: "🎶 Músicas da semana",
    html,
  });

  console.log("E-mails de músicas enviados.");
}
