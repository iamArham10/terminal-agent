import path from "node:path";
import type { DocumentChunk } from "./types.js";

export function createChunkId(
    filePath: string,
    chunkIndex: number,
    baseDirectory = process.cwd(),
): string {
    const relativePath = path.relative(baseDirectory, filePath);

    return `${relativePath}#${chunkIndex}`;
}

export function createChunkIds(
    filePath: string,
    chunks: DocumentChunk[],
    baseDirectory = process.cwd(),
): string[] {
    return chunks.map((chunk) =>
        createChunkId(filePath, chunk.index, baseDirectory),
    );
}

export function fileIdPrefix(
    filePath: string,
    baseDirectory = process.cwd(),
): string {
    const relativePath = path.relative(baseDirectory, filePath);
    return `${relativePath}#`;
}
