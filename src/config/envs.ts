import "dotenv/config";
import env from "env-var";

export const envs = {
  PORT: env.get("PORT").default("3000").asPortNumber(),
  DATABASE_URL: env.get("DATABASE_URL").required().asString(),
};
