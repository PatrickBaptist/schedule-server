import cron from "node-cron";
import { EmailService } from "../services/emailService";
import { VerseService } from "../services/verseService";
import { UserService } from "../services/usersService";

export function startWeeklyVerseCron() {
  const emailService = new EmailService();
  const verseService = new VerseService();
  const userService = new UserService();

  cron.schedule("0 10 * * 0", async () => {
    console.log("Enviando versículo do dia...");

    try {
        
        const users = await userService.getAllUsers();
        if (users.length === 0) {
            console.log("Nenhum usuário encontrado.");
            return;
        }

      const { verse, reference } = await verseService.getVerseOfTheDay();

      const html = `
        <p>Bom dia! 😄</p>
        <p>Uma palavra para inspirar seu domingo:</p>
        <blockquote>${verse} - ${reference}</blockquote>
        <p>Com carinho,<br><strong>Ministério de Louvor</strong></p>
      `;

      const allEmails = users.map(u => u.email).filter(Boolean);
      console.log("Enviando versículo para os emails:", allEmails);

      if (allEmails.length > 0) {
        await emailService.sendLeaderNotification({
          to: allEmails,
          subject: "📖 Versículo do dia",
          html,
        });
      }

      console.log("Versículo do dia enviado com sucesso!");
    } catch (err) {
      console.error("Erro ao enviar versículo do dia:", err);
    }
  });
}
