import path from "node:path";
import { createChunkId } from "./ids.js";
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
    baseDirectory = process.cwd(),
): ChunkMetadata {
    return {
        file: document.path,
        filename: path.basename(document.path),
        chunkId: createChunkId(document.path, chunk.index, baseDirectory),
        ...(chunk.lineStart !== undefined && chunk.lineEnd !== undefined
            ? { lineStart: chunk.lineStart, lineEnd: chunk.lineEnd }
            : {}),
        ...(chunk.pageNumber !== undefined
            ? { pageNumber: chunk.pageNumber }
            : {}),
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
    baseDirectory = process.cwd(),
): ChunkMetadata[] {
    return chunks.map((chunk) =>
        createChunkMetadata(document, chunk, fileHash, baseDirectory),
    );
}
