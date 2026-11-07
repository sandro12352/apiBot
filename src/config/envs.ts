import "dotenv/config";
import env from "env-var";

export const envs = {
  PORT: env.get("PORT").default("3000").asPortNumber(),
  DATABASE_URL: env.get("DATABASE_URL").required().asString(),
  // El alta de clientes es manual (POST /admin/clients); el registro público va apagado
  ALLOW_PUBLIC_REGISTER: env.get("ALLOW_PUBLIC_REGISTER").default("false").asBool(),

  // Sesiones: access token (JWT) corto + refresh token opaco guardado como hash en BD
  JWT_SECRET: env.get("JWT_SECRET").required().asString(),
  JWT_EXPIRES_IN: env.get("JWT_EXPIRES_IN").default("15m").asString(),
  REFRESH_TOKEN_TTL_DAYS: env.get("REFRESH_TOKEN_TTL_DAYS").default("30").asIntPositive(),

  // Fuerza bruta: bloqueo temporal de la cuenta tras N intentos fallidos
  LOGIN_MAX_ATTEMPTS: env.get("LOGIN_MAX_ATTEMPTS").default("5").asIntPositive(),
  LOGIN_LOCK_MINUTES: env.get("LOGIN_LOCK_MINUTES").default("15").asIntPositive(),

  // HTTP
  CORS_ORIGINS: env.get("CORS_ORIGINS").default("").asArray(",").map((o) => o.trim()).filter(Boolean),
  JSON_BODY_LIMIT: env.get("JSON_BODY_LIMIT").default("1mb").asString(),
  // Rate limit global por IP
  RATE_LIMIT_WINDOW_MS: env.get("RATE_LIMIT_WINDOW_MS").default("60000").asIntPositive(),
  RATE_LIMIT_MAX: env.get("RATE_LIMIT_MAX").default("300").asIntPositive(),
  // Rate limit estricto por IP en login, refresh y envíos de correo
  AUTH_RATE_LIMIT_WINDOW_MS: env.get("AUTH_RATE_LIMIT_WINDOW_MS").default("900000").asIntPositive(),
  AUTH_RATE_LIMIT_MAX: env.get("AUTH_RATE_LIMIT_MAX").default("20").asIntPositive(),
  // Saltos de proxy inverso delante de la app (para obtener la IP real)
  TRUST_PROXY: env.get("TRUST_PROXY").default("1").asIntPositive(),

  // Base de los enlaces que se envían por correo (verificación, recuperación)
  APP_URL: env.get("APP_URL").default("http://localhost:3000").asUrlString().replace(/\/+$/, ""),
  // Nombre del producto que aparece en los correos
  APP_NAME: env.get("APP_NAME").default("Tu plataforma").asString(),
  MAIL_FROM: env.get("MAIL_FROM").default("no-reply@localhost").asString(),
  // Si SMTP_HOST no está definido se usa el adaptador de consola (solo desarrollo)
  SMTP_HOST: env.get("SMTP_HOST").asString(),
  SMTP_PORT: env.get("SMTP_PORT").default("587").asPortNumber(),
  SMTP_USER: env.get("SMTP_USER").asString(),
  SMTP_PASS: env.get("SMTP_PASS").asString(),
};
