import type { MetaWebhookService } from "../../domain";

const INTERVAL_MS = 60_000;
// Margen tras arrancar: recupera lo que quedó a medias antes de un reinicio o una caída
const FIRST_RUN_DELAY_MS = 10_000;

// Reintenta periódicamente los mensajes fallidos o sin terminar. Es provisional: en la Fase 3
// lo sustituye la cola BullMQ. Vive en memoria y solo se arranca desde app.ts (no en los tests).
export class WebhookReprocessor {
    private timer: NodeJS.Timeout | undefined;
    private firstRun: NodeJS.Timeout | undefined;
    private running = false;

    constructor(private readonly service: MetaWebhookService) {}

    start(): void {
        if (this.timer) return;
        // unref: este temporizador no debe impedir que el proceso termine
        this.firstRun = setTimeout(() => void this.run(), FIRST_RUN_DELAY_MS);
        this.firstRun.unref();
        this.timer = setInterval(() => void this.run(), INTERVAL_MS);
        this.timer.unref();
    }

    stop(): void {
        if (this.firstRun) clearTimeout(this.firstRun);
        if (this.timer) clearInterval(this.timer);
        this.firstRun = undefined;
        this.timer = undefined;
    }

    // Una pasada a la vez: si la anterior sigue en curso, esta se omite
    async run(): Promise<void> {
        if (this.running) return;
        this.running = true;
        try {
            await this.service.reprocessPending();
        } catch (error) {
            console.error("[WebhookReprocessor]", error instanceof Error ? error.name : "unknown");
        } finally {
            this.running = false;
        }
    }
}
