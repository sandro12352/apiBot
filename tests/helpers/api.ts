import request from "supertest";
import { buildApp } from "../../src/presentation/server";
import { AppRoutes } from "../../src/presentation/routes";
import { PASSWORD } from "./seed";

export const app = buildApp(AppRoutes.routes);

export const api = () => request(app);

export interface Tokens {
    accessToken: string;
    refreshToken: string;
}

// Login real por HTTP: ejercita sesión, bloqueo y auditoría igual que un cliente
export const login = async (email: string, password = PASSWORD): Promise<Tokens> => {
    const res = await api().post("/auth/login").send({ email, password });
    if (res.status !== 200) {
        throw new Error(`Login falló para ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    }
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
};

export const bearer = (token: string): [string, string] => ["Authorization", `Bearer ${token}`];
