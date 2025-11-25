import cron from "node-cron";
import { UserService } from "../services/usersService";
import { EmailService } from "../services/emailService";
import { MusicService } from "../services/musicService";

export function startWeeklyMusicCron() {
  const userService = new UserService();
  const emailService = new EmailService();
  const musicService = new MusicService();

  cron.schedule("0 10 * * 6", async () => {
    console.log("Enviando músicas da semana para todos...");

    try {
      const users = await userService.getAllUsers();
      if (users.length === 0) {
        console.log("Nenhum usuário encontrado.");
        return;
      }

      const musicLinks = await musicService.fetchWeeklyMusicLinks();
      if (musicLinks.length === 0) {
        console.log("Nenhuma música encontrada para a semana.");
        return;
      }

      let musicListHtml = "<ul>";
      musicLinks.forEach(m => {
        musicListHtml += `<li>
          <strong>${m.name}</strong>
          ${m.cifra ? ` - Tom: ${m.cifra}` : ""}
          ${m.minister ? ` (${m.minister})` : ""}
          ${m.link ? `<br><a href="${m.link}" target="_blank">▶  Assistir</a>` : ""}
        </li>`;
      });
      musicListHtml += "</ul>";

      const html = `
        <h2>Olá pessoal!</h2>
        <p>Este é um lembrete semanal para estudarem as músicas do próximo culto:</p>
        ${musicListHtml}
        <p>🔔 <strong>Não esqueçam de verificar a escala antes do culto!</strong></p>
        <p>Que Deus abençoe o estudo e o ensaio de cada um 🙏</p>
        <p>Com carinho,<br><strong>Ministério de Louvor</strong></p>
      `;

      const allEmails = users.map(u => u.email).filter(Boolean);

      if (allEmails.length > 0) {
        await emailService.sendLeaderNotification({
          to: allEmails,
          subject: "🎶 Músicas da semana - Prepare-se para o culto!",
          html,
        });
      }

      console.log("Emails de músicas da semana enviados com sucesso!");
    } catch (err) {
      console.error("Erro ao enviar músicas da semana:", err);
    }
  });
}
