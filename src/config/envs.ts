import "dotenv/config";
import env from "env-var";

export const envs = {
  PORT: env.get("PORT").default("3000").asPortNumber(),
  DATABASE_URL: env.get("DATABASE_URL").required().asString(),
  // El alta de clientes es manual (POST /admin/clients); el registro público va apagado
  ALLOW_PUBLIC_REGISTER: env.get("ALLOW_PUBLIC_REGISTER").default("false").asBool(),
  JWT_SECRET: env.get("JWT_SECRET").required().asString(),
  JWT_EXPIRES_IN: env.get("JWT_EXPIRES_IN").default("2h").asString(),
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
