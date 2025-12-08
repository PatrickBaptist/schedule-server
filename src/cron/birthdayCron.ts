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
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color:#333;">
          <h2 style="color:#2EBEF2; font-size: 26px; margin-bottom: 10px;">
            🎉 Feliz aniversário, ${bUser.name}! 🎉
          </h2>

          <p style="font-size: 16px; line-height: 1.5;">
            Hoje celebramos sua vida!!  
            Que este novo ciclo venha cheio de paz, propósito e força renovada.
          </p>

          <p style="font-size: 16px; line-height: 1.5;">
            Que o Senhor ilumine seus passos, fortaleça seus sonhos e te conduza em cada decisão.  
            Você é importante, é querido e faz diferença onde passa.
          </p>

          <p style="font-size: 16px; margin-top: 20px; line-height: 1.5;">
            Receba nosso carinho e nossa oração para que este dia seja leve, alegre  
            e cheio da presença de Deus. Que Ele te surpreenda com coisas boas! ✨
          </p>

          <h3 style="color:#2EBEF2; margin-top: 25px;">
            Aproveite o seu dia! Deus te abençoe! 🎂🎈
          </h3>
          
          <p style="margin-top: 30px; font-size: 15px;">
            Com carinho,<br>
            <strong>Ministério de Louvor</strong>
          </p>
        </div>
      `,
    });

    const others = users.filter((u) => u.id !== bUser.id).map((u) => u.email);

    if (others.length > 0) {
      await emailService.sendLeaderNotification({
        to: others,
        subject: `🎂 Hoje é aniversário de ${bUser.name}!`,
        html: `
          <div style="font-family: Arial, sans-serif; padding: 20px; color:#333;">
            <h2 style="color:#ff6b6b; font-size: 24px; margin-bottom: 10px;">
              🎂 Hoje é dia de agradecer a Deus!
            </h2>

            <p style="font-size: 16px; line-height: 1.5;">
              Hoje o nosso colega <strong>${bUser.name}</strong> completa mais um ano de vida!  
              Um dia especial para celebrar aquilo que Deus já fez e o que ainda fará na história dele(a).
            </p>

            <p style="font-size: 16px; line-height: 1.5;">
              Vamos enviar boas palavras, orações e carinho, pedindo para que Deus continue abençoando  
              e fortalecendo esse novo ciclo com alegria, saúde e propósito.
            </p>

            <p style="font-size: 16px; margin-top: 15px; line-height: 1.5;">
              Que seja um dia marcante, cheio de gratidão e boas surpresas. ✨
            </p>

            <p style="margin-top: 30px; font-size: 15px;">
              Att,<br>
              <strong>Ministério de Louvor</strong>
            </p>
          </div>
        `,
      });
    }
  }

  console.log("Emails de aniversário enviados.");
}
