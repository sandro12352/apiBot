import type { ConversationRepository } from "../../domain";

const INTERVAL_MS = 60 * 60_000;
const FIRST_RUN_DELAY_MS = 30_000;

// Borra el contexto de conversación vencido (7 días desde la última actividad). Temporizador
// en memoria, igual que WebhookReprocessor; solo se arranca desde app.ts (no en los tests).
export class ContextCleaner {
    private timer: NodeJS.Timeout | undefined;
    private firstRun: NodeJS.Timeout | undefined;
    private running = false;

    constructor(private readonly conversations: ConversationRepository) {}

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

    // Una pasada a la vez; devuelve cuántos mensajes borró
    async run(now: Date = new Date()): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        try {
            return await this.conversations.deleteExpired(now);
        } catch (error) {
            console.error("[ContextCleaner]", error instanceof Error ? error.name : "unknown");
            return 0;
        } finally {
            this.running = false;
        }
    }
}
