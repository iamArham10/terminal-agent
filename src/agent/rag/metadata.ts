import type { ChunkMetadata, DocumentChunk, ParsedDocument } from "./types.js";

function extensionToType(extension: string): string {
    switch (extension) {
        case ".md":
            return "markdown";
        case ".txt":
            return "text";
        case ".pdf":
            return "pdf";
        default:
            return extension.replace(/^\./, "") || "unknown";
    }
}

export function createChunkMetadata(
    document: ParsedDocument,
    chunk: DocumentChunk,
    fileHash: string,
): ChunkMetadata {
    return {
        file: document.path,
        extension: document.extension,
        type: extensionToType(document.extension),
        chunk: chunk.index,
        totalChunks: chunk.totalChunks,
        hash: fileHash,
    };
}

export function createChunkMetadatas(
    document: ParsedDocument,
    chunks: DocumentChunk[],
    fileHash: string,
): ChunkMetadata[] {
    return chunks.map((chunk) =>
        createChunkMetadata(document, chunk, fileHash),
    );
}
