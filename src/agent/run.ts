import "dotenv/config";
import { generateText } from "ai";
// import { openai } from "@ai-sdk/openai";
import { groq } from "@ai-sdk/groq";

import { tools } from "./tools";
import { executeTool } from "./executeTool";
import { SYSTEM_PROMPT } from "./system/prompt";

const MODEL_NAME = "llama-3.3-70b-versatile";

export async function runAgent(userMessage: string): Promise<string> {
    const { text, toolCalls } = await generateText({
        model: groq(MODEL_NAME),
        prompt: userMessage,
        system: SYSTEM_PROMPT,
        tools,
    });
    console.log(toolCalls);
    console.log(text);

    toolCalls.forEach(async (tool) => {
        console.log(
            await executeTool(tool.toolName, tool.toolCallId, tool.input),
        );
    });
}

runAgent("What is the current weather?");
