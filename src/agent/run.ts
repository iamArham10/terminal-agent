import "dotenv/config";
import { generateText } from "ai";
// import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";
import { Laminar, getTracer } from "@lmnr-ai/lmnr";

import { tools } from "./tools/index.ts";
import { executeTool } from "./executeTool.ts";
import { SYSTEM_PROMPT } from "./system/prompt.ts";

const MODEL_NAME = "llama-3.3-70b-versatile";

Laminar.initialize({
    projectApiKey: process.env.LMNR_PROJECT_API_KEY,
});

export async function runAgent(userMessage: string): Promise<string> {
    const { text, toolCalls } = await generateText({
        model: groq(MODEL_NAME),
        prompt: userMessage,
        system: SYSTEM_PROMPT,
        tools,
        experimental_telemetry: {
            isEnabled: true,
            tracer: getTracer(),
        },
    });

    console.log(toolCalls);
    console.log(text);

    toolCalls.forEach(async (tool) => {
        console.log(
            await executeTool(tool.toolName, tool.toolCallId, tool.input),
        );
    });

    await Laminar.flush();
    console.log("done");
    return "hello";
}
