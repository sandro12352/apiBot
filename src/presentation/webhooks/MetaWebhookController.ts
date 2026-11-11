import type { Request, Response } from "express";
import { MetaWebhookDto, type MetaWebhookService } from "../../domain";

const queryString = (value: unknown): string => (typeof value === "string" ? value : "");

export class MetaWebhookController {
    constructor(private readonly service: MetaWebhookService) {}

    // GET: Meta verifica la URL al registrar el webhook
    verify = (req: Request, res: Response) => {
        const challenge = this.service.verifyChallenge(
            queryString(req.query["hub.mode"]),
            queryString(req.query["hub.verify_token"]),
            queryString(req.query["hub.challenge"]),
        );

        if (challenge === null) {
            res.sendStatus(403);
            return;
        }

        // text/plain: el challenge se refleja tal cual y no debe interpretarse como HTML
        res.status(200).type("text/plain").send(challenge);
    };

    // POST: eventos de WhatsApp. Se guarda, se responde 200 rápido y luego se procesa.
    receive = async (req: Request, res: Response) => {
        if (!this.service.verifySignature(req.rawBody, req.header("x-hub-signature-256"))) {
            res.status(401).json({ error: "Invalid signature" });
            return;
        }

        const [errors, dto] = MetaWebhookDto.create(req.body);
        if (errors) {
            res.status(400).json({ error: "Invalid payload" });
            return;
        }

        try {
            const jobs = await this.service.ingest(dto!);
            res.sendStatus(200);
            // Sin await: Meta ya recibió su 200. process() no lanza y guarda los fallos en BD.
            void this.service.process(jobs);
        } catch (error) {
            console.error("[MetaWebhook] Could not store events", error instanceof Error ? error.name : "unknown");
            // 500: Meta reintenta y, al no haberse guardado, no hay duplicado
            res.sendStatus(500);
        }
    };
}
