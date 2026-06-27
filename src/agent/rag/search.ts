import type { Where } from "chromadb";
import { getCollection } from "./collection.js";
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
  const collection = await getCollection(
    options.collection ?? ragConfig.collectionName,
  );
  const where = buildWhereFilter(options);

  const results = await collection.query<ChunkMetadata>({
    queryEmbeddings: [queryEmbedding],
    nResults: options.topK ?? ragConfig.topK,
    where,
    include: ["distances", "documents", "metadatas"],
  });

  const distances = results.distances[0] ?? [];
  const documents = results.documents[0] ?? [];
  const metadatas = results.metadatas[0] ?? [];

  const searchResults: SearchResult[] = [];

  for (let i = 0; i < distances.length; i++) {
    const distance = distances[i];
    const content = documents[i];
    const metadata = metadatas[i];

    if (distance === null || content === null || metadata === null) {
      continue;
    }

    searchResults.push({
      file: metadata.file,
      score: 1 - distance,
      content,
      metadata,
    });
  }

  return searchResults;
}
