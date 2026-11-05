import { EmailSender, type EmailMessage } from "../../domain";

// Solo para desarrollo: imprime el correo en consola en lugar de enviarlo.
export class ConsoleEmailAdapter extends EmailSender {
    async send({ to, subject, text }: EmailMessage): Promise<void> {
        console.log(`\n[ConsoleEmail] To: ${to}\nSubject: ${subject}\n${text}\n`);
    }
}
