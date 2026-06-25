import { tavilySearch as _tavilySearch } from "@tavily/ai-sdk";
import { tool, type Tool } from "ai";
import z from "zod";

const baseSearch = _tavilySearch({
    searchDepth: "advanced",
    includeAnswer: "advanced",
    maxResults: 3,
    topic: "general",
});

export const webSearch: Tool = tool({
    description: baseSearch.description,
    inputSchema: z.object({
        query: z.string().describe("The search query to look up for"),
    }),
    execute: async (args: any, context: any) => {
        if (baseSearch.execute) {
            const result = await baseSearch.execute(
                args as any,
                context as any,
            );
            return JSON.stringify(result);
        }
        return "{}";
    },
});
