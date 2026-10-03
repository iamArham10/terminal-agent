import { tool } from "ai";
import z from "zod";
import { search } from "../rag/search.js";
import { formatSearchResults } from "../rag/citations.js";

export const ragSearch = tool({
    description:
        "Search indexed Markdown, TXT, and PDF documents. Returns JSON results with structured source citations; cite each citation.label when using its content.",
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
            .describe(
                "Optional file extension filter, like .md, .txt, or .pdf",
            ),
        type: z
            .string()
            .optional()
            .describe(
                "Optional document type filter, like markdown, text, or pdf",
            ),
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
