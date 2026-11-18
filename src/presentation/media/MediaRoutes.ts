import { Router, type Request, type Response } from "express";
import { isSafeStorageKey } from "../../config/adapters/file-storage";
import { MIME_BY_EXTENSION } from "../../config/adapters/image-type";
import { buildFileStorage, buildMediaUrlSigner } from "../auth/auth.factory";

// GET /media/<clave>?exp=..&sig=..: sirve un archivo privado solo con un enlace firmado y vigente.
// La usa WhatsApp para descargar las imágenes que envía el bot y el panel para mostrarlas.
// Cualquier fallo (clave inválida, firma mala, enlace vencido o archivo inexistente) da 404,
// para no revelar qué archivos existen.
export class MediaRoutes {

    static get routes(): Router {
        const router = Router();
        const storage = buildFileStorage();
        const signer = buildMediaUrlSigner();

        router.get('/*key', async (req: Request, res: Response) => {
            const segments = (req.params as { key?: string[] | string }).key;
            const key = Array.isArray(segments) ? segments.join("/") : String(segments ?? "");

            if (!isSafeStorageKey(key) || !signer.verify(key, req.query.exp, req.query.sig)) {
                return res.status(404).json({ error: "Not found" });
            }

            try {
                const data = await storage.read(key);
                if (!data) return res.status(404).json({ error: "Not found" });

                const extension = key.slice(key.lastIndexOf(".") + 1);
                res.setHeader("Content-Type", MIME_BY_EXTENSION[extension] ?? "application/octet-stream");
                res.setHeader("Cache-Control", "private, max-age=300");
                return res.send(data);
            } catch (error) {
                console.error("[Media] read failed", error instanceof Error ? error.name : "error");
                return res.status(500).json({ error: "Internal server error" });
            }
        });

        return router;
    }
}
