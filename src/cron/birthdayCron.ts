import cron from "node-cron";
import dayjs from "dayjs";
import { UserService } from "../services/usersService";
import { EmailService } from "../services/emailService";

export function startBirthdayCron() {
  const userService = new UserService();
  const emailService = new EmailService();

  cron.schedule("0 8 * * *", async () => {
    console.log("Verificando aniversários...");

    try {
      const users = await userService.getAllUsers();
      const today = dayjs().format("MM-DD");

      const birthdayUsers = users.filter((u) =>
        u.birthDate && dayjs(u.birthDate).format("MM-DD") === today
      );

      if (birthdayUsers.length === 0) {
        console.log("Nenhum aniversariante hoje");
        return;
      }

      for (const bUser of birthdayUsers) {
        console.log(`Enviando e-mails pelo aniversário de ${bUser.name}`);

        await emailService.sendLeaderNotification({
          to: [bUser.email],
          subject: "🎉 Feliz aniversário!",
          html: `
            <h2>Feliz aniversário, ${bUser.nickname ?? bUser.name}! 🎉</h2>
            <p>Hoje celebramos a sua vida e agradecemos a Deus por você fazer parte do nosso ministério.</p>
            <p>Que o Senhor continue derramando graça, saúde e alegria sobre sua vida.</p>
            <p>Que este novo ciclo seja cheio da presença de Deus! 🙏</p>
            <p>Com carinho,<br><strong>Ministério de Louvor</strong></p>
          `,
        });

        const others = users.filter((u) => u.id !== bUser.id).map((u) => u.email);

        if (others.length > 0) {
          await emailService.sendLeaderNotification({
            to: others,
            subject: `🎂 Hoje é aniversário de ${bUser.nickname ?? bUser.name}!`,
            html: `
              <p>Hoje celebramos a vida de <strong>${bUser.name}</strong>! 🎉</p>
              <p>Mande uma mensagem de carinho!</p>
            `,
          });
        }
      }

      console.log("Emails de aniversário enviados.");
    } catch (err) {
      console.error("Erro no cron de aniversário:", err);
    }
  });
}
