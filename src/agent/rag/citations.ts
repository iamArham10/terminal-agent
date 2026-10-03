import path from "node:path";
import type { ChunkMetadata, SearchResult, SourceCitation } from "./types.js";

function integer(value: unknown, minimum: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum ? value : undefined;
}

export function createCitation(
  metadata: Record<string, unknown>,
  id?: string | null,
  collection?: string,
): SourceCitation | undefined {
  if (typeof metadata.file !== "string" || !metadata.file.trim()) return undefined;
  const file = metadata.file;
  const chunk = integer(metadata.chunk, 0);
  const total = integer(metadata.totalChunks, 1);
  const totalChunks = total !== undefined && chunk !== undefined && total > chunk ? total : undefined;
  const pageNumber = integer(metadata.pageNumber, 1);
  const start = integer(metadata.lineStart, 1);
  const end = integer(metadata.lineEnd, 1);
  const lines = pageNumber === undefined && metadata.type !== "pdf" && metadata.extension !== ".pdf" &&
    start !== undefined && end !== undefined && end >= start
    ? { lineStart: start, lineEnd: end } : {};
  const chunkId = id || (typeof metadata.chunkId === "string" && metadata.chunkId ? metadata.chunkId : undefined);
  const parts = [file];
  if (pageNumber !== undefined) parts.push(`p. ${pageNumber}`);
  if (lines.lineStart !== undefined) parts.push(`lines ${lines.lineStart}–${lines.lineEnd}`);
  if (chunk !== undefined) parts.push(`chunk ${chunk + 1}${totalChunks ? `/${totalChunks}` : ""}`);
  else if (chunkId) parts.push(`chunk ${chunkId}`);
  return {
    file,
    filename: path.posix.basename(file.replaceAll("\\", "/")),
    ...(collection ? { collection } : {}),
    ...(chunkId ? { chunkId } : chunk !== undefined ? { chunkId: `${file}#${chunk}` } : {}),
    ...(chunk !== undefined ? { chunk } : {}),
    ...(totalChunks !== undefined ? { totalChunks } : {}),
    ...(pageNumber !== undefined ? { pageNumber } : {}),
    ...lines,
    label: `[${parts.join(", ")}]`,
  };
}

// Pure mapping keeps citation validation testable without embeddings or Chroma.
export function mapRetrievalResults(results: {
  ids?: ReadonlyArray<ReadonlyArray<string | null>>;
  distances: ReadonlyArray<ReadonlyArray<number | null>>;
  documents: ReadonlyArray<ReadonlyArray<string | null>>;
  metadatas: ReadonlyArray<ReadonlyArray<Record<string, unknown> | null>>;
}, collection?: string): SearchResult[] {
  const output: SearchResult[] = [];
  const distances = results.distances[0] ?? [];
  for (let index = 0; index < distances.length; index++) {
    const distance = distances[index];
    const content = results.documents[0]?.[index];
    const metadata = results.metadatas[0]?.[index];
    if (typeof distance !== "number" || !Number.isFinite(distance) || typeof content !== "string" || !metadata) continue;
    const citation = createCitation(metadata, results.ids?.[0]?.[index], collection);
    if (!citation) continue;
    output.push({
      file: citation.file,
      score: 1 - distance,
      content,
      metadata: metadata as ChunkMetadata,
      citation,
    });
  }
  return output;
}

export function formatSearchResults(results: SearchResult[]): string {
  return JSON.stringify({
    message: results.length ? "Cite the supplied citation.label when using each source." : "No relevant documents found.",
    results,
  }, null, 2);
}
