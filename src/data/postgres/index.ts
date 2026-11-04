import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../generated/prisma/client";
import { envs } from "../../config/envs";


const adapter = new PrismaPg({connectionString:envs.DATABASE_URL});
export const prisma = new PrismaClient({ adapter });

