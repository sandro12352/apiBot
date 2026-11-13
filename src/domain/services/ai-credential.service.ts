import type { Encryptor } from "../../config/adapters/encryptor";
import { AIProviderError, type AIModel, type AIProvider, type AIProviderName, type AIProviderRegistry } from "../../config/adapters/ai-provider";
import type { SaveAiCredentialDto } from "../dtos/save-ai-credential.dto";
import { AuditAction } from "../entities/audit.entity";
import type { AiCredentialInfo } from "../entities/ai.entity";
import { CustomError } from "../errors/custom.error";
import type { AiCredentialRepository } from "../repositories/ai-credential.repository";
import type { AuditService } from "./audit.service";

const NOT_FOUND = "AI credential not found";
const INVALID_KEY = "The API key is invalid or has no permission";
const UNAVAILABLE = "Could not reach the AI provider. Try again later";

// "AIza…x7Qk": lo bastante para reconocer la clave sin poder reconstruirla
const mask = (apiKey: string): string => `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;

// BYOK: cada empresa aporta su propia clave. Se valida al guardarla, se cifra con la clave
// maestra y nunca sale del backend; el tenantId sale de req.tenant, nunca del body.
export class AiCredentialService {

    constructor(
        private readonly repository: AiCredentialRepository,
        private readonly providers: AIProviderRegistry,
        private readonly encryptor: Encryptor,
        private readonly auditService: AuditService,
    ) {}


    private handleError(error: unknown, action: string): never {
        if (error instanceof CustomError) throw error;
        console.error(`[AiCredentialService.${action}]`, error instanceof Error ? error.name : "error");
        throw CustomError.databaseError(`Database error on AI credential ${action}`);
    }

    private provider(name: AIProviderName): AIProvider {
        const provider = this.providers.get(name);
        if (!provider) throw CustomError.badRequest("AI provider not supported");
        return provider;
    }

    // Traduce el error del proveedor a uno que el administrador pueda entender
    private fromProvider(error: unknown): CustomError {
        if (error instanceof AIProviderError) {
            if (error.kind === "auth") return CustomError.badRequest(INVALID_KEY);
            return CustomError.badGateway(UNAVAILABLE);
        }
        return CustomError.internalServerError("Unexpected error validating the API key");
    }


    async list(tenantId: string): Promise<AiCredentialInfo[]> {
        try {
            return await this.repository.list(tenantId);
        } catch (error) {
            this.handleError(error, "list");
        }
    }

    // Valida la clave con el proveedor ANTES de guardarla: una clave rota no queda registrada
    async save(
        tenantId: string,
        providerName: AIProviderName,
        dto: SaveAiCredentialDto,
        actorUserId: string,
    ): Promise<AiCredentialInfo> {
        const provider = this.provider(providerName);

        let models: AIModel[];
        try {
            models = await provider.listModels(dto.apiKey);
        } catch (error) {
            if (error instanceof AIProviderError && error.kind === "auth") {
                await this.auditService.record({
                    actorUserId,
                    tenantId,
                    action: AuditAction.AI_CREDENTIAL_SAVE,
                    resourceType: "ai_credential",
                    resourceId: providerName,
                    result: "FAILURE",
                });
            }
            throw this.fromProvider(error);
        }

        // Solo se aceptan modelos que la propia clave puede usar
        if (dto.preferredModel && !models.some((model) => model.id === dto.preferredModel)) {
            throw CustomError.badRequest("The model is not available for this API key");
        }

        try {
            const saved = await this.repository.save(tenantId, providerName, {
                encryptedApiKey: this.encryptor.encrypt(dto.apiKey),
                maskedKey: mask(dto.apiKey),
                status: "VALID",
                statusDetail: null,
                preferredModel: dto.preferredModel ?? null,
            });

            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.AI_CREDENTIAL_SAVE,
                resourceType: "ai_credential",
                resourceId: providerName,
                result: "SUCCESS",
            });
            return saved;
        } catch (error) {
            this.handleError(error, "save");
        }
    }

    // Vuelve a probar la clave guardada y actualiza su estado
    async test(tenantId: string, providerName: AIProviderName, actorUserId: string): Promise<AiCredentialInfo> {
        const provider = this.provider(providerName);

        try {
            const stored = await this.repository.find(tenantId, providerName);
            if (!stored) throw CustomError.notFound(NOT_FOUND);

            let apiKey: string;
            try {
                apiKey = this.encryptor.decrypt(stored.encryptedApiKey);
            } catch {
                await this.repository.setStatus(tenantId, providerName, "INVALID", "The stored API key could not be read");
                return await this.requireCredential(tenantId, providerName);
            }

            try {
                await provider.listModels(apiKey);
                await this.repository.setStatus(tenantId, providerName, "VALID", null);
            } catch (error) {
                if (error instanceof AIProviderError && error.kind === "auth") {
                    await this.repository.setStatus(tenantId, providerName, "INVALID", INVALID_KEY);
                } else {
                    // Proveedor caído o con límite: no es culpa de la clave, el estado no cambia
                    throw this.fromProvider(error);
                }
            }

            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.AI_CREDENTIAL_TEST,
                resourceType: "ai_credential",
                resourceId: providerName,
                result: "SUCCESS",
            });
            return await this.requireCredential(tenantId, providerName);
        } catch (error) {
            this.handleError(error, "test");
        }
    }

    async models(tenantId: string, providerName: AIProviderName): Promise<AIModel[]> {
        const provider = this.provider(providerName);

        try {
            const stored = await this.repository.find(tenantId, providerName);
            if (!stored) throw CustomError.notFound(NOT_FOUND);

            let apiKey: string;
            try {
                apiKey = this.encryptor.decrypt(stored.encryptedApiKey);
            } catch {
                throw CustomError.conflict("The stored API key could not be read. Save it again");
            }
            return await provider.listModels(apiKey).catch((error: unknown) => {
                throw this.fromProvider(error);
            });
        } catch (error) {
            this.handleError(error, "models");
        }
    }

    async remove(tenantId: string, providerName: AIProviderName, actorUserId: string): Promise<void> {
        try {
            const removed = await this.repository.remove(tenantId, providerName);
            if (!removed) throw CustomError.notFound(NOT_FOUND);

            await this.auditService.record({
                actorUserId,
                tenantId,
                action: AuditAction.AI_CREDENTIAL_DELETE,
                resourceType: "ai_credential",
                resourceId: providerName,
                result: "SUCCESS",
            });
        } catch (error) {
            this.handleError(error, "remove");
        }
    }

    private async requireCredential(tenantId: string, providerName: AIProviderName): Promise<AiCredentialInfo> {
        const stored = await this.repository.find(tenantId, providerName);
        if (!stored) throw CustomError.notFound(NOT_FOUND);
        // Se descarta la clave cifrada: la vista pública no la incluye
        const { encryptedApiKey: _omit, ...info } = stored;
        return info;
    }
}
