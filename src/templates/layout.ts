// Utilidades y estructura base compartida por todas las plantillas de correo.
// Los estilos van en línea y con tablas porque los clientes de correo (Gmail,
// Outlook) ignoran <style> y no soportan flexbox/grid.

export interface RenderedEmail {
    subject: string;
    text: string;
    html: string;
}

export const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

interface LayoutOptions {
    appName: string;
    // Texto corto que algunos clientes muestran junto al asunto en la bandeja
    preheader: string;
    // Contenido ya escapado/seguro
    body: string;
}

export const renderLayout = ({ appName, preheader, body }: LayoutOptions): string => `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(appName)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f4f5f7;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;">
        <tr>
          <td style="padding:28px 40px 0 40px;font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:bold;color:#111827;">
            ${escapeHtml(appName)}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px 32px 40px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#374151;">
            ${body}
          </td>
        </tr>
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="padding:20px 40px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#9ca3af;text-align:center;">
            Este mensaje se envió automáticamente desde ${escapeHtml(appName)}. Por favor, no respondas a este correo.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

// Botón de llamada a la acción compatible con Outlook (usa tabla, no <button>)
export const renderButton = (href: string, label: string): string => `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#2563eb;border-radius:6px;">
      <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
