import { envs } from "../../config/envs";
import { WhatsAppSender, type SendTextParams } from "../../config/adapters/whatsapp-sender";
import { WhatsAppApiError, type PhoneNumberInfo, type WhatsAppAccount } from "../../config/adapters/whatsapp-account";

const REQUEST_TIMEOUT_MS = 10_000;

// Error normalizado: nunca incluye el token ni el cuerpo del mensaje
export class WhatsAppSendError extends Error {
    constructor(
        public readonly httpStatus: number,
        public readonly metaCode?: number,
    ) {
        super(`WhatsApp send failed (HTTP ${httpStatus}${metaCode !== undefined ? `, code ${metaCode}` : ""})`);
        this.name = "WhatsAppSendError";
    }
}

export class WhatsAppCloudClient extends WhatsAppSender implements WhatsAppAccount {

    // Consulta el número con el token: valida que existe y que el token tiene acceso
    async getPhoneNumber({ phoneNumberId, accessToken }: { phoneNumberId: string; accessToken: string }): Promise<PhoneNumberInfo> {
        const url = `https://graph.facebook.com/${envs.META_GRAPH_API_VERSION}/${phoneNumberId}?fields=display_phone_number,verified_name`;

        let response: Response;
        try {
            response = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch {
            throw new WhatsAppApiError(0);
        }

        const data = (await response.json().catch(() => ({}))) as {
            display_phone_number?: string;
            verified_name?: string;
            error?: { code?: number };
        };

        if (!response.ok) throw new WhatsAppApiError(response.status, data.error?.code);

        return {
            ...(data.display_phone_number ? { displayPhoneNumber: data.display_phone_number } : {}),
            ...(data.verified_name ? { verifiedName: data.verified_name } : {}),
        };
    }

    async sendText({ phoneNumberId, to, body, accessToken }: SendTextParams): Promise<{ messageId?: string }> {
        const url = `https://graph.facebook.com/${envs.META_GRAPH_API_VERSION}/${phoneNumberId}/messages`;

        let response: Response;
        try {
            response = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messaging_product: "whatsapp",
                    recipient_type: "individual",
                    to,
                    type: "text",
                    text: { body },
                }),
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
            });
        } catch {
            // Timeout o red caída; el detalle de fetch puede incluir la URL
            throw new Error("WhatsApp send failed (network or timeout)");
        }

        const data = (await response.json().catch(() => ({}))) as {
            messages?: { id?: string }[];
            error?: { code?: number };
        };

        if (!response.ok) throw new WhatsAppSendError(response.status, data.error?.code);

        const messageId = data.messages?.[0]?.id;
        return messageId ? { messageId } : {};
    }
}
