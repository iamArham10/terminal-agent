import type { Where } from "chromadb";
import { getCollection } from "./collection.js";
import { mapRetrievalResults } from "./citations.js";
import { ragConfig } from "./config.js";
import { embed } from "./embed.js";
import type { ChunkMetadata, SearchOptions, SearchResult } from "./types.js";

function normalizeSearchInput(input: string | SearchOptions): SearchOptions {
  if (typeof input === "string") {
    return { query: input };
  }

  return input;
}

function buildWhereFilter(options: SearchOptions): Where | undefined {
  const filters: Where[] = [];

  if (options.file) {
    filters.push({ file: options.file });
  }

  if (options.extension) {
    filters.push({ extension: options.extension });
  }

  if (options.type) {
    filters.push({ type: options.type });
  }

  if (filters.length === 0) {
    return undefined;
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return { $and: filters };
}

export async function search(
  input: string | SearchOptions,
): Promise<SearchResult[]> {
  const options = normalizeSearchInput(input);

  if (!options.query.trim()) {
    throw new Error("Query cannot be empty");
  }

  const queryEmbedding = await embed(options.query);
  const collectionName = options.collection ?? ragConfig.collectionName;
  const collection = await getCollection(collectionName);
  const where = buildWhereFilter(options);

  const results = await collection.query<ChunkMetadata>({
    queryEmbeddings: [queryEmbedding],
    nResults: options.topK ?? ragConfig.topK,
    where,
    include: ["distances", "documents", "metadatas"],
  });

  return mapRetrievalResults(results, collectionName);
}
