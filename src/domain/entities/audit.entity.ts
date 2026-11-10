export type AuditResult = "SUCCESS" | "FAILURE";

// Nombres de acción centralizados para que no se dispersen por el código
export const AuditAction = {
    AUTH_LOGIN: "auth.login",
    AUTH_LOCKOUT: "auth.lockout",
    AUTH_PASSWORD_RESET: "auth.password_reset",
    AUTH_LOGOUT_ALL: "auth.logout_all",
    AUTH_REFRESH_REUSE: "auth.refresh_reuse",
    ADMIN_CLIENT_CREATE: "admin.client.create",
    ADMIN_TENANT_STATUS: "admin.tenant.status",
    ADMIN_USER_UPDATE: "admin.user.update",
    ADMIN_USER_DELETE: "admin.user.delete",
    TENANT_UPDATE: "tenant.update",
    TENANT_MEMBER_ADD: "tenant.member.add",
    TENANT_MEMBER_ROLE: "tenant.member.role",
    TENANT_MEMBER_REMOVE: "tenant.member.remove",
} as const;

export type AuditActionName = (typeof AuditAction)[keyof typeof AuditAction];

// Nunca incluir secretos, tokens, contraseñas ni contenido de mensajes en metadata
export interface AuditEntry {
    actorUserId: string | null;
    tenantId: string | null;
    action: AuditActionName;
    resourceType: string;
    resourceId: string | null;
    result: AuditResult;
    metadata?: Record<string, string | number | boolean | null> | undefined;
}
