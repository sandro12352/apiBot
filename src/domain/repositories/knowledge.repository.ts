import type {
    CreateKnowledgeInput,
    KnowledgeEntry,
    KnowledgeSnippet,
    KnowledgeType,
    UpdateKnowledgeInput,
} from "../entities/knowledge.entity";

export abstract class KnowledgeRepository {
    abstract list(tenantId: string, type?: KnowledgeType): Promise<KnowledgeEntry[]>;
    abstract count(tenantId: string): Promise<number>;
    abstract find(tenantId: string, id: string): Promise<KnowledgeEntry | null>;
    abstract create(tenantId: string, input: CreateKnowledgeInput): Promise<KnowledgeEntry>;
    abstract update(tenantId: string, id: string, input: UpdateKnowledgeInput): Promise<KnowledgeEntry | null>;
    abstract remove(tenantId: string, id: string): Promise<boolean>;
    abstract activeSize(tenantId: string): Promise<number>;
    abstract allActive(tenantId: string): Promise<KnowledgeSnippet[]>;
    abstract search(tenantId: string, text: string, limit: number): Promise<KnowledgeSnippet[]>;
}
