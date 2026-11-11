import type { ConnectWhatsappDto } from "../dtos/connect-whatsapp.dto";
import { AuditAction } from "../entities/audit.entity";
import type { ConnectionCheckResult, WhatsappConnectionInfo } from "../entities/whatsapp-connection.entity";
import { CustomError } from "../errors/custom.error";
import type { WhatsappConnectionRepository } from "../repositories/whatsapp-connection.repository";
import { WhatsAppApiError, type WhatsAppAccount } from "../../config/adapters/whatsapp-account";
import type { Encryptor } from "../../config/adapters/encryptor";
import type { AuditService } from "./audit.service";

const NOT_FOUND = "WhatsApp connection not found";
const INVALID_CREDENTIALS = "The access token is invalid or cannot access this phone number";
const UNAVAILABLE = "Could not reach WhatsApp. Try again later";

// Conexión de WhatsApp de UNA empresa. El tenantId sale de req.tenant (ya validado por
// TenantMiddleware), nunca del body. El token solo existe en claro dentro de estos métodos.
export class WhatsappConnectionService {

    constructor(
        private readonly repository: WhatsappConnectionRepository,
        private readonly account: WhatsAppAccount,
        private readonly encryptor: Encryptor,
        private readonly auditService: AuditService,
    ) {}


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[WhatsappConnectionService.${action}]`, error instanceof Error ? error.name : "error");
        throw CustomError.databaseError(`Database error on WhatsApp connection ${action}`);
    }

    private isUniqueViolation(error: unknown): boolean {
        return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
    }


    async get(tenantId: string): Promise<WhatsappConnectionInfo> {
        try {
            const connection = await this.repository.findByTenant(tenantId);
            if (!connection) throw CustomError.notFound(NOT_FOUND);
            return connection;
        } catch (error) {
            this.handleError(error, "get");
        }
    }

    // Conecta o reemplaza las credenciales (renovar un token es volver a llamar a esto).
    // Antes de guardar se comprueba con Meta que el token ve el número.
    async connect(tenantId: string, dto: ConnectWhatsappDto, actorUserId: string): Promise<{
        connection: WhatsappConnectionInfo;
        replaced: boolean;
    }> {
        let displayPhoneNumber: string | null = null;
        try {
            const phone = await this.account.getPhoneNumber({
                phoneNumberId: dto.phoneNumberId,
                accessToken: dto.accessToken,
            });
            displayPhoneNumber = phone.displayPhoneNumber ?? null;
        } catch (error) {
            if (error instanceof WhatsAppApiError && (error.isInvalidToken || error.isNotAccessible)) {
                await this.auditService.record({
                    actorUserId,
                    tenantId,
                    action: AuditAction.TENANT_WHATSAPP_CONNECT,
                    resourceType: "whatsapp_connection",
                    resourceId: null,
                    result: "FAILURE",
                    metadata: { phoneNumberId: dto.phoneNumberId },
                });
                throw CustomError.badRequest(INVALID_CREDENTIALS);
            }
            if (error instanceof WhatsAppApiError) throw CustomError.badGateway(UNAVAILABLE);
            throw error;
        }

        try {
            const saved = await this.repository.save(tenantId, {
                wabaId: dto.wabaId,
                phoneNumberId: dto.phoneNumberId,
                displayPhoneNumber,
                encryptedAccessToken: this.encryptor.encrypt(dto.accessToken),
            });

            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.TENANT_WHATSAPP_CONNECT,
                resourceType: "whatsapp_connection",
                resourceId: saved.connection.id,
                result: "SUCCESS",
                metadata: { phoneNumberId: dto.phoneNumberId, replaced: saved.replaced },
            });
            return saved;
        } catch (error) {
            // El mensaje no revela de quién es el número
            if (this.isUniqueViolation(error)) throw CustomError.conflict("This phone number cannot be connected");
            this.handleError(error, "connect");
        }
    }

    // Prueba la conexión contra Meta y actualiza el estado (por ejemplo, token caducado)
    async check(tenantId: string): Promise<WhatsappConnectionInfo> {
        try {
            const credentials = await this.repository.findCredentials(tenantId);
            if (!credentials) throw CustomError.notFound(NOT_FOUND);
            if (credentials.status === "DISCONNECTED" || !credentials.encryptedAccessToken) {
                throw CustomError.conflict("The connection is disconnected. Connect it again");
            }

            let result: ConnectionCheckResult;
            try {
                const accessToken = this.encryptor.decrypt(credentials.encryptedAccessToken);
                const phone = await this.account.getPhoneNumber({
                    phoneNumberId: credentials.phoneNumberId,
                    accessToken,
                });
                result = {
                    ok: true,
                    status: "CONNECTED",
                    detail: null,
                    ...(phone.displayPhoneNumber ? { displayPhoneNumber: phone.displayPhoneNumber } : {}),
                };
            } catch (error) {
                result = this.toCheckFailure(error);
            }

            return await this.repository.recordCheck(credentials.id, result);
        } catch (error) {
            this.handleError(error, "check");
        }
    }

    // Idempotente: desconectar una conexión ya desconectada devuelve su estado actual
    async disconnect(tenantId: string, actorUserId: string): Promise<WhatsappConnectionInfo> {
        try {
            const credentials = await this.repository.findCredentials(tenantId);
            if (!credentials) throw CustomError.notFound(NOT_FOUND);

            if (credentials.status === "DISCONNECTED") {
                const current = await this.repository.findByTenant(tenantId);
                if (current) return current;
                throw CustomError.notFound(NOT_FOUND);
            }

            const connection = await this.repository.disconnect(credentials.id);
            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.TENANT_WHATSAPP_DISCONNECT,
                resourceType: "whatsapp_connection",
                resourceId: connection.id,
                result: "SUCCESS",
            });
            return connection;
        } catch (error) {
            this.handleError(error, "disconnect");
        }
    }

    private toCheckFailure(error: unknown): ConnectionCheckResult {
        if (error instanceof WhatsAppApiError) {
            if (error.isInvalidToken) {
                return { ok: false, status: "TOKEN_EXPIRED", detail: "The access token is invalid or expired" };
            }
            // Meta caído o con límite: no es culpa de la conexión, el estado no cambia
            if (error.isUnavailable) return { ok: false, detail: "WhatsApp API unavailable" };
            return { ok: false, status: "ERROR", detail: error.message };
        }
        // Token guardado ilegible (clave maestra cambiada o dato dañado)
        return { ok: false, status: "ERROR", detail: "The stored access token could not be read" };
    }
}
