import { tool } from "ai";
import z from "zod";
import { search } from "../rag/search.js";

function formatSearchResults(
  results: Awaited<ReturnType<typeof search>>,
): string {
  if (results.length === 0) {
    return "No relevant documents found.";
  }

  return results
    .map((result) => {
      return [
        `File: ${result.file}`,
        `Chunk: ${result.metadata.chunk + 1}/${result.metadata.totalChunks}`,
        `Type: ${result.metadata.type}`,
        `Similarity: ${result.score.toFixed(2)}`,
        "",
        "Content:",
        result.content,
      ].join("\n");
    })
    .join("\n\n--------------------------\n\n");
}

export const ragSearch = tool({
  description:
    "Search indexed Markdown, TXT, and PDF documents using semantic search.",
  inputSchema: z.object({
    query: z.string().describe("The semantic search query"),
    collection: z
      .string()
      .optional()
      .describe("Optional Chroma collection name to search"),
    file: z
      .string()
      .optional()
      .describe("Optional exact file path to filter results"),
    extension: z
      .string()
      .optional()
      .describe("Optional file extension filter, like .md, .txt, or .pdf"),
    type: z
      .string()
      .optional()
      .describe("Optional document type filter, like markdown, text, or pdf"),
    topK: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Optional number of results to return"),
  }),
  execute: async ({
    query,
    collection,
    file,
    extension,
    type,
    topK,
  }: {
    query: string;
    collection?: string;
    file?: string;
    extension?: string;
    type?: string;
    topK?: number;
  }) => {
    try {
      const results = await search({
        query,
        collection,
        file,
        extension,
        type,
        topK,
      });

      return formatSearchResults(results);
    } catch (error) {
      return `RAG search failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  },
});
