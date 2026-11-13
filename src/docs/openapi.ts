// Documento OpenAPI 3.1 de la API, escrito a mano. Al añadir o cambiar un endpoint hay que
// actualizarlo aquí (tests/docs.test.ts avisa si una ruta de Express no está documentada).

type Json = Record<string, unknown>;

const str = (extra: Json = {}): Json => ({ type: "string", ...extra });
const obj = (properties: Json, required: string[] = []): Json => ({ type: "object", properties, required });
const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const body = (schema: Json, example?: unknown): Json => ({
    required: true,
    content: { "application/json": { schema, ...(example !== undefined ? { example } : {}) } },
});
const json = (description: string, schema?: Json): Json => ({
    description,
    ...(schema ? { content: { "application/json": { schema } } } : {}),
});

const bearer = [{ bearerAuth: [] }];
const tenantId = { $ref: "#/components/parameters/tenantId" };
const userId = { name: "userId", in: "path", required: true, schema: str({ format: "uuid" }) };
const id = { name: "id", in: "path", required: true, schema: str({ format: "uuid" }) };
const provider = {
    name: "provider",
    in: "path",
    required: true,
    description: "Hoy solo hay adaptador de GEMINI; OPENAI y ANTHROPIC responden 400.",
    schema: { type: "string", enum: ["GEMINI", "OPENAI", "ANTHROPIC"] },
};

const errorResponses = (...codes: number[]): Json =>
    Object.fromEntries(
        codes.map((code) => [
            String(code),
            {
                description: {
                    400: "Datos inválidos",
                    401: "Sin sesión o token inválido",
                    403: "Sin permiso",
                    404: "No existe (o no pertenece a tu empresa)",
                    409: "Conflicto",
                    429: "Demasiadas peticiones",
                }[code],
                content: { "application/json": { schema: ref("Error") } },
            },
        ]),
    );

const operation = (
    tag: string,
    summary: string,
    options: {
        description?: string;
        auth?: boolean;
        parameters?: Json[];
        requestBody?: Json;
        success: Json;
        errors?: number[];
    },
): Json => ({
    tags: [tag],
    summary,
    ...(options.description ? { description: options.description } : {}),
    ...(options.auth === false ? {} : { security: bearer }),
    ...(options.parameters ? { parameters: options.parameters } : {}),
    ...(options.requestBody ? { requestBody: options.requestBody } : {}),
    responses: {
        ...options.success,
        ...errorResponses(...(options.errors ?? [400, 401])),
    },
});

const ok = (description: string, schema?: Json, code = "200"): Json => ({ [code]: json(description, schema) });
const noContent: Json = { "204": { description: "Hecho, sin contenido" } };
const message = (description: string, code: string): Json => ({ [code]: json(description, ref("Message")) });

const ADMIN = "Solo TENANT_ADMIN de la empresa.";

export const openApiDocument: Json = {
    openapi: "3.1.0",
    info: {
        title: "API del chatbot de WhatsApp con IA",
        version: "1.0.0",
        description:
            "SaaS multiempresa. Inicia sesión en `POST /auth/login`, copia el `accessToken` y pulsa **Authorize** " +
            "(solo el token, sin la palabra Bearer). Los errores siempre llegan como `{ \"error\": ... }`.",
    },
    servers: [{ url: "/", description: "Este servidor" }],
    tags: [
        { name: "Auth" },
        { name: "Empresa" },
        { name: "Miembros" },
        { name: "WhatsApp" },
        { name: "Claves de IA" },
        { name: "Asistente" },
        { name: "Plataforma (admin)" },
    ],
    components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
        parameters: {
            tenantId: { name: "tenantId", in: "path", required: true, schema: str({ format: "uuid" }), description: "Id de la empresa" },
        },
        schemas: {
            Error: obj({ error: { description: "Texto, o lista de textos con los campos inválidos", oneOf: [str(), { type: "array", items: str() }] } }),
            Message: obj({ message: str() }),
            User: obj({
                id: str({ format: "uuid" }),
                email: str({ format: "email" }),
                status: str({ enum: ["PENDING_VERIFICATION", "ACTIVE", "SUSPENDED"] }),
                isPlatformAdmin: { type: "boolean" },
            }),
            Tokens: obj({ accessToken: str(), refreshToken: str({ description: "64 caracteres hexadecimales" }) }),
            Tenant: obj({
                id: str({ format: "uuid" }),
                name: str(),
                slug: str(),
                status: str({ enum: ["ACTIVE", "SUSPENDED", "CANCELLED"] }),
                botMode: str({ enum: ["TEST", "LIVE"] }),
                botEnabled: { type: "boolean" },
            }),
            Member: obj({
                userId: str({ format: "uuid" }),
                email: str({ format: "email" }),
                role: str({ enum: ["TENANT_ADMIN", "MEMBER"] }),
            }),
            WhatsappConnection: obj({
                id: str({ format: "uuid" }),
                wabaId: str(),
                phoneNumberId: str(),
                status: str({ enum: ["PENDING", "CONNECTED", "DISCONNECTED", "NOT_ELIGIBLE", "ERROR"] }),
                botEnabled: { type: "boolean" },
            }),
            AiCredential: obj({
                provider: str({ enum: ["GEMINI", "OPENAI", "ANTHROPIC"] }),
                status: str({ enum: ["PENDING", "VALID", "INVALID", "QUOTA_EXCEEDED"] }),
                maskedKey: str({ example: "AIza…6789", description: "La clave nunca se devuelve completa" }),
                preferredModel: { type: ["string", "null"] },
                statusDetail: { type: ["string", "null"] },
            }),
            AiModel: obj({ id: str({ example: "gemini-3.1-flash-lite" }), displayName: str() }, ["id"]),
            Assistant: obj({
                id: str({ format: "uuid" }),
                name: str(),
                instructions: str(),
                language: str({ example: "es" }),
                tone: { type: ["string", "null"] },
                businessRules: { type: ["string", "null"] },
                aiProvider: { type: ["string", "null"], enum: ["OPENAI", "ANTHROPIC", "GEMINI", null] },
                aiModel: { type: ["string", "null"] },
            }),
        },
    },
    paths: {
        // ---------- Auth ----------
        "/auth/register": {
            post: operation("Auth", "Registrar una cuenta", {
                description: "Solo existe si el registro público está habilitado en el servidor.",
                auth: false,
                requestBody: body(
                    obj({ email: str({ format: "email" }), password: str({ minLength: 8, maxLength: 72 }), acceptPrivacy: { const: true }, acceptTerms: { const: true } }, ["email", "password", "acceptPrivacy", "acceptTerms"]),
                ),
                success: ok("Cuenta creada", ref("User"), "201"),
                errors: [400, 409, 429],
            }),
        },
        "/auth/login": {
            post: operation("Auth", "Iniciar sesión", {
                auth: false,
                requestBody: body(obj({ email: str({ format: "email" }), password: str() }, ["email", "password"])),
                success: ok("Sesión iniciada", obj({ user: ref("User"), accessToken: str(), refreshToken: str() })),
                errors: [400, 401, 429],
            }),
        },
        "/auth/refresh": {
            post: operation("Auth", "Renovar tokens", {
                description: "Rota el refresh token: el anterior deja de servir.",
                auth: false,
                requestBody: body(obj({ refreshToken: str() }, ["refreshToken"])),
                success: ok("Tokens nuevos", ref("Tokens")),
                errors: [400, 401, 429],
            }),
        },
        "/auth/logout": { post: operation("Auth", "Cerrar la sesión actual", { success: noContent }) },
        "/auth/logout-all": { post: operation("Auth", "Cerrar todas las sesiones", { success: noContent }) },
        "/auth/me": {
            get: operation("Auth", "Usuario actual y sus empresas", {
                success: ok("Perfil", obj({ user: ref("User"), tenants: { type: "array", items: obj({ id: str(), name: str(), role: str() }) } })),
            }),
        },
        "/auth/verify-email/request": {
            post: operation("Auth", "Pedir el correo de verificación", {
                auth: false,
                requestBody: body(obj({ email: str({ format: "email" }) }, ["email"])),
                success: message("Siempre 202, exista o no la cuenta", "202"),
                errors: [400, 429],
            }),
        },
        "/auth/verify-email": {
            post: operation("Auth", "Verificar el correo", {
                auth: false,
                requestBody: body(obj({ token: str() }, ["token"])),
                success: message("Correo verificado", "200"),
                errors: [400, 429],
            }),
        },
        "/auth/forgot-password": {
            post: operation("Auth", "Pedir recuperación de contraseña", {
                auth: false,
                requestBody: body(obj({ email: str({ format: "email" }) }, ["email"])),
                success: message("Siempre 202, exista o no la cuenta", "202"),
                errors: [400, 429],
            }),
        },
        "/auth/reset-password": {
            post: operation("Auth", "Definir una contraseña nueva", {
                description: "Sirve para recuperar la contraseña y para activar una cuenta creada por un administrador (en ese caso hay que aceptar privacidad y términos).",
                auth: false,
                requestBody: body(obj({ token: str(), password: str({ minLength: 8, maxLength: 72 }), acceptPrivacy: { const: true }, acceptTerms: { const: true } }, ["token", "password"])),
                success: message("Contraseña actualizada", "200"),
                errors: [400, 429],
            }),
        },

        // ---------- Empresa ----------
        "/tenants/{tenantId}": {
            get: operation("Empresa", "Ver la empresa", {
                description: "Cualquier miembro.",
                parameters: [tenantId],
                success: ok("Empresa y tu rol", { allOf: [ref("Tenant"), obj({ role: str({ enum: ["TENANT_ADMIN", "MEMBER"] }) })] }),
                errors: [401, 403, 404],
            }),
            patch: operation("Empresa", "Cambiar el nombre", {
                description: ADMIN,
                parameters: [tenantId],
                requestBody: body(obj({ name: str({ minLength: 2, maxLength: 100 }) }, ["name"])),
                success: ok("Empresa actualizada", ref("Tenant")),
                errors: [400, 401, 403, 404],
            }),
        },

        // ---------- Miembros ----------
        "/tenants/{tenantId}/members": {
            get: operation("Miembros", "Listar miembros", {
                description: ADMIN,
                parameters: [tenantId],
                success: ok("Miembros", { type: "array", items: ref("Member") }),
                errors: [401, 403, 404],
            }),
            post: operation("Miembros", "Añadir un miembro", {
                description: `${ADMIN} Si el correo no tiene cuenta, se crea y se le envía el enlace para definir su contraseña.`,
                parameters: [tenantId],
                requestBody: body(obj({ email: str({ format: "email" }), role: str({ enum: ["TENANT_ADMIN", "MEMBER"], default: "MEMBER" }) }, ["email"])),
                success: ok("Miembro añadido", ref("Member"), "201"),
                errors: [400, 401, 403, 404, 409, 429],
            }),
        },
        "/tenants/{tenantId}/members/{userId}": {
            patch: operation("Miembros", "Cambiar el rol", {
                description: ADMIN,
                parameters: [tenantId, userId],
                requestBody: body(obj({ role: str({ enum: ["TENANT_ADMIN", "MEMBER"] }) }, ["role"])),
                success: ok("Miembro actualizado", ref("Member")),
                errors: [400, 401, 403, 404, 409],
            }),
            delete: operation("Miembros", "Quitar un miembro", {
                description: ADMIN,
                parameters: [tenantId, userId],
                success: noContent,
                errors: [401, 403, 404, 409],
            }),
        },
        "/tenants/{tenantId}/members/{userId}/setup-email": {
            post: operation("Miembros", "Reenviar el correo de activación", {
                description: ADMIN,
                parameters: [tenantId, userId],
                success: message("Correo enviado", "202"),
                errors: [401, 403, 404, 409, 429],
            }),
        },

        // ---------- WhatsApp ----------
        "/tenants/{tenantId}/whatsapp": {
            get: operation("WhatsApp", "Ver la conexión de WhatsApp", {
                description: `${ADMIN} Nunca devuelve el token.`,
                parameters: [tenantId],
                success: ok("Conexión", ref("WhatsappConnection")),
                errors: [401, 403, 404],
            }),
            put: operation("WhatsApp", "Conectar o reemplazar el número", {
                description: `${ADMIN} Valida el token con Meta antes de guardarlo (cifrado). 201 si es nueva, 200 si reemplaza.`,
                parameters: [tenantId],
                requestBody: body(
                    obj({ phoneNumberId: str({ pattern: "^\\d{5,30}$" }), wabaId: str({ pattern: "^\\d{5,30}$" }), accessToken: str({ minLength: 20, maxLength: 2000 }) }, ["phoneNumberId", "wabaId", "accessToken"]),
                ),
                success: { "200": json("Conexión reemplazada", ref("WhatsappConnection")), "201": json("Conexión creada", ref("WhatsappConnection")) },
                errors: [400, 401, 403, 404, 409, 429],
            }),
            delete: operation("WhatsApp", "Desconectar", {
                description: ADMIN,
                parameters: [tenantId],
                success: ok("Conexión desconectada", ref("WhatsappConnection")),
                errors: [401, 403, 404],
            }),
        },
        "/tenants/{tenantId}/whatsapp/check": {
            post: operation("WhatsApp", "Comprobar la conexión con Meta", {
                description: ADMIN,
                parameters: [tenantId],
                success: ok("Conexión con su estado actualizado", ref("WhatsappConnection")),
                errors: [401, 403, 404, 429],
            }),
        },

        // ---------- Claves de IA ----------
        "/tenants/{tenantId}/ai-credentials": {
            get: operation("Claves de IA", "Listar las claves de IA de la empresa", {
                description: `${ADMIN} Solo muestra la clave enmascarada y su estado.`,
                parameters: [tenantId],
                success: ok("Claves", { type: "array", items: ref("AiCredential") }),
                errors: [401, 403, 404],
            }),
        },
        "/tenants/{tenantId}/ai-credentials/{provider}": {
            put: operation("Claves de IA", "Guardar o reemplazar la clave (BYOK)", {
                description: `${ADMIN} La clave se valida con el proveedor antes de guardarse, se cifra y nunca se devuelve completa. Pégala solo aquí, nunca en un chat.`,
                parameters: [tenantId, provider],
                requestBody: body(obj({ apiKey: str({ minLength: 20, maxLength: 500 }), preferredModel: str({ description: "Modelo por defecto de la clave (opcional)" }) }, ["apiKey"])),
                success: ok("Clave guardada", ref("AiCredential")),
                errors: [400, 401, 403, 404, 429],
            }),
            delete: operation("Claves de IA", "Eliminar la clave", {
                description: `${ADMIN} Sin clave, el bot deja de responder.`,
                parameters: [tenantId, provider],
                success: noContent,
                errors: [400, 401, 403, 404],
            }),
        },
        "/tenants/{tenantId}/ai-credentials/{provider}/test": {
            post: operation("Claves de IA", "Probar la clave guardada", {
                description: `${ADMIN} Actualiza el estado de la clave (VALID, INVALID...).`,
                parameters: [tenantId, provider],
                success: ok("Clave con su estado", ref("AiCredential")),
                errors: [400, 401, 403, 404, 429],
            }),
        },
        "/tenants/{tenantId}/ai-credentials/{provider}/models": {
            get: operation("Claves de IA", "Modelos que acepta la clave", {
                description: `${ADMIN} Pregunta al proveedor. Elige el id de aquí para \`aiModel\` del asistente; no todos sirven para chat.`,
                parameters: [tenantId, provider],
                success: ok("Modelos", { type: "array", items: ref("AiModel") }),
                errors: [400, 401, 403, 404, 429],
            }),
        },

        // ---------- Asistente ----------
        "/tenants/{tenantId}/assistant": {
            get: operation("Asistente", "Ver el asistente", {
                description: ADMIN,
                parameters: [tenantId],
                success: ok("Asistente", ref("Assistant")),
                errors: [401, 403, 404],
            }),
            put: operation("Asistente", "Crear o actualizar el asistente", {
                description: `${ADMIN} Sin asistente y sin clave en estado VALID el bot no responde. Si no hay \`aiModel\` se usa el \`preferredModel\` de la clave.`,
                parameters: [tenantId],
                requestBody: body(
                    obj(
                        {
                            name: str({ maxLength: 100 }),
                            instructions: str({ maxLength: 8000 }),
                            language: str({ default: "es", description: "es o es-PE" }),
                            tone: { type: ["string", "null"], maxLength: 200 },
                            businessRules: { type: ["string", "null"], maxLength: 4000 },
                            aiProvider: { type: ["string", "null"], enum: ["OPENAI", "ANTHROPIC", "GEMINI", null] },
                            aiModel: { type: ["string", "null"] },
                        },
                        ["name", "instructions"],
                    ),
                    { name: "Asistente de Mi Empresa", instructions: "Eres el asistente de Mi Empresa. Responde breve y amable.", language: "es", aiModel: "gemini-3.1-flash-lite" },
                ),
                success: ok("Asistente guardado", ref("Assistant")),
                errors: [400, 401, 403, 404],
            }),
        },

        // ---------- Plataforma ----------
        "/admin/clients": {
            post: operation("Plataforma (admin)", "Crear un cliente (empresa + su administrador)", {
                description: "Solo administrador de plataforma. Envía al correo el enlace para definir la contraseña.",
                requestBody: body(obj({ email: str({ format: "email" }), tenantName: str({ minLength: 2, maxLength: 100 }) }, ["email", "tenantName"])),
                success: ok("Cliente creado", obj({ user: ref("User"), tenantId: str(), tenantSlug: str() }), "201"),
                errors: [400, 401, 403, 409],
            }),
        },
        "/admin/users/{id}/setup-email": {
            post: operation("Plataforma (admin)", "Reenviar el correo de activación", {
                parameters: [id],
                success: message("Correo enviado", "202"),
                errors: [400, 401, 403, 404],
            }),
        },
        "/admin/tenants": {
            get: operation("Plataforma (admin)", "Listar empresas", { success: ok("Empresas", { type: "array", items: ref("Tenant") }), errors: [401, 403] }),
        },
        "/admin/tenants/{id}": {
            get: operation("Plataforma (admin)", "Ver una empresa", { parameters: [id], success: ok("Empresa", ref("Tenant")), errors: [400, 401, 403, 404] }),
        },
        "/admin/tenants/{id}/status": {
            patch: operation("Plataforma (admin)", "Suspender, cancelar o reactivar una empresa", {
                parameters: [id],
                requestBody: body(obj({ status: str({ enum: ["ACTIVE", "SUSPENDED", "CANCELLED"] }) }, ["status"])),
                success: ok("Empresa actualizada", ref("Tenant")),
                errors: [400, 401, 403, 404],
            }),
        },
        "/admin/users": {
            get: operation("Plataforma (admin)", "Listar usuarios", { success: ok("Usuarios", { type: "array", items: ref("User") }), errors: [401, 403] }),
        },
        "/admin/users/{id}": {
            patch: operation("Plataforma (admin)", "Cambiar correo o contraseña de un usuario", {
                description: "Envía al menos email o password.",
                parameters: [id],
                requestBody: body(obj({ email: str({ format: "email" }), password: str({ minLength: 8, maxLength: 72 }) })),
                success: ok("Usuario actualizado", ref("User")),
                errors: [400, 401, 403, 404, 409],
            }),
            delete: operation("Plataforma (admin)", "Eliminar un usuario", { parameters: [id], success: noContent, errors: [400, 401, 403, 404] }),
        },
    },
};
