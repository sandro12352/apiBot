import { escapeHtml, renderButton, renderLayout, type RenderedEmail } from "./layout";

export interface AccountSetupTemplateData {
    appName: string;
    // Enlace con el token para definir la contraseña
    link: string;
    // Horas de validez del enlace
    expiresInHours: number;
}

// Correo que recibe un cliente cuando un administrador le crea la cuenta:
// le invita a definir su contraseña (lo que también confirma su correo).
export const renderAccountSetupEmail = ({
    appName,
    link,
    expiresInHours,
}: AccountSetupTemplateData): RenderedEmail => {
    const subject = `Tu cuenta en ${appName} está lista`;

    const text = [
        `Bienvenido a ${appName}.`,
        "",
        "Hemos creado tu cuenta. Para empezar, define tu contraseña y confirma tu correo abriendo este enlace:",
        link,
        "",
        `El enlace es válido durante ${expiresInHours} horas y solo puede usarse una vez.`,
        "Al definir tu contraseña deberás aceptar la política de privacidad y los términos del servicio.",
        "",
        "Si no esperabas este correo, puedes ignorarlo.",
    ].join("\n");

    const body = `<h1 style="margin:0 0 16px 0;font-size:22px;line-height:28px;color:#111827;">Tu cuenta está lista</h1>
<p style="margin:0 0 12px 0;">Bienvenido a <strong>${escapeHtml(appName)}</strong>. Hemos creado tu cuenta; solo falta que definas tu contraseña y confirmes tu correo.</p>
${renderButton(link, "Definir mi contraseña")}
<p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#6b7280;">El enlace es válido durante <strong>${expiresInHours} horas</strong> y solo puede usarse una vez. Al definir tu contraseña deberás aceptar la política de privacidad y los términos del servicio.</p>
<p style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:#6b7280;">Si el botón no funciona, copia y pega este enlace en tu navegador:<br><a href="${escapeHtml(link)}" style="color:#2563eb;word-break:break-all;">${escapeHtml(link)}</a></p>
<p style="margin:16px 0 0 0;font-size:13px;line-height:20px;color:#6b7280;">Si no esperabas este correo, puedes ignorarlo.</p>`;

    const html = renderLayout({
        appName,
        preheader: "Define tu contraseña para empezar a usar tu cuenta.",
        body,
    });

    return { subject, text, html };
};
