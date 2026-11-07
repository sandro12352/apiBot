import { rateLimit } from "express-rate-limit";
import { envs } from "../../config/envs";

const message = { error: 'Too many requests. Try again later' };

// Límite general por IP para toda la API
export const globalRateLimit = rateLimit({
    windowMs: envs.RATE_LIMIT_WINDOW_MS,
    limit: envs.RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message,
});

// Límite estricto por IP para login, refresh y endpoints que envían correos
export const authRateLimit = rateLimit({
    windowMs: envs.AUTH_RATE_LIMIT_WINDOW_MS,
    limit: envs.AUTH_RATE_LIMIT_MAX,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message,
});
