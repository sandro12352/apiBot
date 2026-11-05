import nodemailer, { type Transporter } from "nodemailer";
import { EmailSender, type EmailMessage } from "../../domain";
import { envs } from "../envs";

export class NodemailerAdapter extends EmailSender {
    private readonly transporter: Transporter;

    constructor() {
        super();
        this.transporter = nodemailer.createTransport({
            host: envs.SMTP_HOST!,
            port: envs.SMTP_PORT,
            secure: envs.SMTP_PORT === 465,
            ...(envs.SMTP_USER && envs.SMTP_PASS
                ? { auth: { user: envs.SMTP_USER, pass: envs.SMTP_PASS } }
                : {}),
        });
    }

    async send({ to, subject, text, html }: EmailMessage): Promise<void> {
        await this.transporter.sendMail({
            from: envs.MAIL_FROM,
            to,
            subject,
            text,
            ...(html ? { html } : {}),
        });
    }
}
