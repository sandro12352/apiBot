import type {
    CreateKnowledgeInput,
    KnowledgeDatasource,
    KnowledgeEntry,
    KnowledgeRepository,
    KnowledgeSnippet,
    KnowledgeType,
    UpdateKnowledgeInput,
} from "../../domain";

export class KnowledgeRepositoryImpl implements KnowledgeRepository {
    constructor(private readonly datasource: KnowledgeDatasource) {}

    list(tenantId: string, type?: KnowledgeType): Promise<KnowledgeEntry[]> {
        return this.datasource.list(tenantId, type);
    }

    count(tenantId: string): Promise<number> {
        return this.datasource.count(tenantId);
    }

    find(tenantId: string, id: string): Promise<KnowledgeEntry | null> {
        return this.datasource.find(tenantId, id);
    }

    create(tenantId: string, input: CreateKnowledgeInput): Promise<KnowledgeEntry> {
        return this.datasource.create(tenantId, input);
    }

    update(tenantId: string, id: string, input: UpdateKnowledgeInput): Promise<KnowledgeEntry | null> {
        return this.datasource.update(tenantId, id, input);
    }

    remove(tenantId: string, id: string): Promise<boolean> {
        return this.datasource.remove(tenantId, id);
    }

    activeSize(tenantId: string): Promise<number> {
        return this.datasource.activeSize(tenantId);
    }

    allActive(tenantId: string): Promise<KnowledgeSnippet[]> {
        return this.datasource.allActive(tenantId);
    }

    search(tenantId: string, text: string, limit: number): Promise<KnowledgeSnippet[]> {
        return this.datasource.search(tenantId, text, limit);
    }
}
