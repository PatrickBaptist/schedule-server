import nodemailer from "nodemailer";

export class EmailService {
  private transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  async sendLeaderNotification(data: {
    to: string[];
    subject: string;
    html?: string;
  }) {

    const mailOptions = {
      from: `"Sistema de Escala" <${process.env.EMAIL_USER}>`,
      to: data.to.join(","),
      subject: data.subject,
      html: data.html,
    };

    await this.transporter.sendMail(mailOptions);
  }
}
