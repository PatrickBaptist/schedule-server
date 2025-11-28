import dayjs from "dayjs";
import { UserService } from "../services/usersService";
import { EmailService } from "../services/emailService";

export async function runBirthdayJob() {
  const userService = new UserService();
  const emailService = new EmailService();

  console.log("Verificando aniversários...");

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
    await emailService.sendLeaderNotification({
      to: [bUser.email],
      subject: "🎉 Feliz aniversário!",
      html: `...`,
    });

    const others = users.filter((u) => u.id !== bUser.id).map((u) => u.email);

    if (others.length > 0) {
      await emailService.sendLeaderNotification({
        to: others,
        subject: `🎂 Hoje é aniversário de ${bUser.name}!`,
        html: `...`,
      });
    }
  }

  console.log("Emails de aniversário enviados.");
}
