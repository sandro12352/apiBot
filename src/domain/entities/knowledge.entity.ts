// Base de conocimiento de una empresa: preguntas frecuentes (FAQ) y textos de referencia (TEXT).
// FAQ: title = pregunta, content = respuesta. TEXT: title = tema, content = texto libre.
// Los documentos (PDF, DOCX, CSV, XLSX) llegan en un tramo posterior.
export type KnowledgeType = "FAQ" | "TEXT";

// Límites: protegen el consumo de tokens y el tamaño del prompt
export const KNOWLEDGE_TITLE_MAX = 200;
export const KNOWLEDGE_CONTENT_MAX = 4000;
export const KNOWLEDGE_MAX_ENTRIES = 300;

export interface KnowledgeEntry {
    id: string;
    type: KnowledgeType;
    title: string;
    content: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateKnowledgeInput {
    type: KnowledgeType;
    title: string;
    content: string;
    isActive: boolean;
}

export interface UpdateKnowledgeInput {
    title?: string;
    content?: string;
    isActive?: boolean;
}

// Lo que recibe la IA: solo tipo, título y contenido de las entradas activas
export interface KnowledgeSnippet {
    type: KnowledgeType;
    title: string;
    content: string;
}
