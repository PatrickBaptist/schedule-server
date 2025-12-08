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

  const musicListHtml =
    `
      <ul style="padding-left: 18px; font-size: 15px;">
        ${musicLinks
          .map(
            (m) => `
          <li style="margin-bottom: 14px;">
            <strong>${m.name}</strong>
            ${m.cifra ? ` - Tom: ${m.cifra}` : ""}
            ${m.minister ? ` (${m.minister})` : ""}
            ${
              m.link
                ? `<br><a href="${m.link}" target="_blank" style="color:#2EBEF2; text-decoration:none;">▶ Assistir</a>`
                : ""
            }
          </li>
        `
          )
          .join("")}
      </ul>
    `;

  const html = `
    <div style="font-family: Arial, sans-serif; color:#333; line-height:1.6;">
      <h2 style="margin-bottom: 10px;">Olá, pessoal! 🎶</h2>

      <p style="font-size: 16px; margin-bottom: 12px;">
        Segue a lista de músicas para o próximo culto.  
        Preparem-se com carinho e dedicação — que cada um dê o seu melhor ao Senhor!
      </p>

      ${musicListHtml}

      <p style="margin-top: 20px; font-size: 15px;">
        Com carinho,<br>
        <strong>Ministério de Louvor</strong>
      </p>
    </div>
  `;

  const allEmails = users.map(u => u.email).filter(Boolean);

  await emailService.sendLeaderNotification({
    to: allEmails,
    subject: "🎶 Músicas da semana",
    html,
  });

  console.log("E-mails de músicas enviados.");
}
