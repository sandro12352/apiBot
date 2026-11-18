import type {
    CreateKnowledgeInput,
    KnowledgeEntry,
    KnowledgeSnippet,
    KnowledgeType,
    UpdateKnowledgeInput,
} from "../entities/knowledge.entity";

// Toda operación va filtrada por tenantId: una empresa nunca ve ni toca entradas de otra.
export abstract class KnowledgeDatasource {
    abstract list(tenantId: string, type?: KnowledgeType): Promise<KnowledgeEntry[]>;
    abstract count(tenantId: string): Promise<number>;
    abstract find(tenantId: string, id: string): Promise<KnowledgeEntry | null>;
    abstract create(tenantId: string, input: CreateKnowledgeInput): Promise<KnowledgeEntry>;
    // null si la entrada no existe en esa empresa
    abstract update(tenantId: string, id: string, input: UpdateKnowledgeInput): Promise<KnowledgeEntry | null>;
    abstract remove(tenantId: string, id: string): Promise<boolean>;

    // Total de caracteres de las entradas activas (título + contenido)
    abstract activeSize(tenantId: string): Promise<number>;
    // Todas las entradas activas, de la más reciente a la más antigua
    abstract allActive(tenantId: string): Promise<KnowledgeSnippet[]>;
    // Entradas activas relacionadas con el texto, de la más a la menos relevante
    abstract search(tenantId: string, text: string, limit: number): Promise<KnowledgeSnippet[]>;
}
