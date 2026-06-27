import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { ragConfig } from "./config.js";
import type { DocumentChunk, ParsedDocument } from "./types.js";

export const chunkText = async (text: string): Promise<DocumentChunk[]> => {
    if (!text.trim()) {
        return [];
    }

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: ragConfig.chunkSize,
        chunkOverlap: ragConfig.chunkOverlap,
    });

    const chunks = await splitter.splitText(text);

    return chunks.map((chunk, index) => ({
        chunk,
        index,
        totalChunks: chunks.length,
    }));
};

export const chunkDocument = async (
    document: ParsedDocument,
): Promise<DocumentChunk[]> => {
    return chunkText(document.text);
};
