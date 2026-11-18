import { prisma } from "../../data/postgres";
import {
    KnowledgeDatasource,
    type CreateKnowledgeInput,
    type KnowledgeEntry,
    type KnowledgeSnippet,
    type KnowledgeType,
    type UpdateKnowledgeInput,
} from "../../domain";

// Solo FAQ y TEXT: los documentos usan la misma tabla pero llegan en otro tramo
const TYPES: KnowledgeType[] = ["FAQ", "TEXT"];

type Row = {
    id: string;
    type: string;
    title: string;
    content: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
};

const toEntry = (row: Row): KnowledgeEntry => ({
    id: row.id,
    type: row.type as KnowledgeType,
    title: row.title,
    content: row.content ?? "",
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
});

const select = { id: true, type: true, title: true, content: true, isActive: true, createdAt: true, updatedAt: true } as const;

export class KnowledgeDatasourceImpl extends KnowledgeDatasource {

    async list(tenantId: string, type?: KnowledgeType): Promise<KnowledgeEntry[]> {
        const rows = await prisma.knowledgeSource.findMany({
            where: { tenantId, type: type ? type : { in: TYPES } },
            orderBy: { createdAt: "desc" },
            select,
        });
        return rows.map(toEntry);
    }

    count(tenantId: string): Promise<number> {
        return prisma.knowledgeSource.count({ where: { tenantId, type: { in: TYPES } } });
    }

    async find(tenantId: string, id: string): Promise<KnowledgeEntry | null> {
        const row = await prisma.knowledgeSource.findFirst({ where: { id, tenantId, type: { in: TYPES } }, select });
        return row ? toEntry(row) : null;
    }

    async create(tenantId: string, input: CreateKnowledgeInput): Promise<KnowledgeEntry> {
        // FAQ y TEXT no necesitan procesamiento: quedan listos al guardarse
        const row = await prisma.knowledgeSource.create({
            data: { tenantId, ...input, status: "READY", processedAt: new Date() },
            select,
        });
        return toEntry(row);
    }

    async update(tenantId: string, id: string, input: UpdateKnowledgeInput): Promise<KnowledgeEntry | null> {
        const { count } = await prisma.knowledgeSource.updateMany({
            where: { id, tenantId, type: { in: TYPES } },
            data: input,
        });
        return count === 0 ? null : this.find(tenantId, id);
    }

    async remove(tenantId: string, id: string): Promise<boolean> {
        const { count } = await prisma.knowledgeSource.deleteMany({ where: { id, tenantId, type: { in: TYPES } } });
        return count > 0;
    }

    async activeSize(tenantId: string): Promise<number> {
        const [row] = await prisma.$queryRaw<{ size: number }[]>`
            SELECT COALESCE(SUM(char_length(title) + char_length(COALESCE(content, ''))), 0)::int AS size
            FROM knowledge_sources
            WHERE "tenantId" = ${tenantId} AND "isActive" = true AND type::text IN ('FAQ', 'TEXT')`;
        return row?.size ?? 0;
    }

    async allActive(tenantId: string): Promise<KnowledgeSnippet[]> {
        const rows = await prisma.knowledgeSource.findMany({
            where: { tenantId, isActive: true, type: { in: TYPES } },
            orderBy: { updatedAt: "desc" },
            select: { type: true, title: true, content: true },
        });
        return rows.map((row) => ({ type: row.type as KnowledgeType, title: row.title, content: row.content ?? "" }));
    }

    // Búsqueda de texto completo en español. El analizador reduce cada palabra a su raíz y le quita
    // las tildes ("envíos" y "envios" coinciden) y descarta las palabras vacías ("el", "de", "sí").
    // Basta con que coincida UNA palabra del mensaje; se ordena por cuántas coinciden.
    async search(tenantId: string, text: string, limit: number): Promise<KnowledgeSnippet[]> {
        if (!text.trim()) return [];

        const rows = await prisma.$queryRaw<{ type: string; title: string; content: string | null }[]>`
            WITH query AS (
                SELECT to_tsquery('simple', COALESCE(string_agg(quote_literal(lexeme), ' | '), '')) AS q
                FROM unnest(tsvector_to_array(to_tsvector('spanish', lower(${text})))) AS lexeme
            )
            SELECT k.type::text AS type, k.title, k.content
            FROM knowledge_sources k, query
            WHERE k."tenantId" = ${tenantId}
              AND k."isActive" = true
              AND k.type::text IN ('FAQ', 'TEXT')
              AND to_tsvector('spanish', lower(k.title || ' ' || COALESCE(k.content, ''))) @@ query.q
            ORDER BY ts_rank(to_tsvector('spanish', lower(k.title || ' ' || COALESCE(k.content, ''))), query.q) DESC,
                     k."updatedAt" DESC
            LIMIT ${limit}`;

        return rows.map((row) => ({ type: row.type as KnowledgeType, title: row.title, content: row.content ?? "" }));
    }
}
