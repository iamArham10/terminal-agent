import { EvalData, SingleTurnResult } from "./types";
import { generateText, stepCountIs, tool, type ToolSet } from "ai";
import { groq } from "@ai-sdk/groq";
import z from "zod";

import { buildMessages } from "./utils";

const TOOL_DEFINITIONS: any = {
    readFile: {
        description: "Read the content of a file",
        parameters: z.object({
            path: z.string().describe("the path to file you want to read"),
        }),
    },
    writeFile: {
        description: "Write the content to the file at the given path",
        parameters: z.object({
            path: z.string().describe("the path to file you want to write to"),
            content: z
                .string()
                .describe("the content you want to write to the file"),
        }),
    },
    listFiles: {
        description: "List all the files in a directory",
        parameters: z.object({
            path: z
                .string()
                .describe("the path of the directory which you want to list"),
        }),
    },
    deleteFile: {
        description: "Delete the file at the given path",
        parameters: z.object({
            path: z
                .string()
                .describe("the path of the file which you want to delete"),
        }),
    },
    executeCommand: {
        description: "Execute a shell command and return its output",
        parameters: z.object({
            command: z.string().describe("The shell command to execute"),
        }),
    },
};

export const singleTurnExecutorWithMocks = async (data: EvalData) => {
    const messages = buildMessages(data);
    const tools: ToolSet = {};
    for (const toolName of data.tools) {
        const toolDef = TOOL_DEFINITIONS[toolName];

        if (toolDef) {
            tools[toolName] = tool({
                description: toolDef.description,
                inputSchema: toolDef.parameters,
            });
        }
    }

    // generate text
    const { toolCalls } = await generateText({
        model: groq(data.config?.model ?? "llama-3.3-70b-versatile"),
        messages,
        tools,
        stopWhen: stepCountIs(1),
        temperature: data.config?.temperature ?? undefined,
        // providerOptions: {
        //     openai: {
        //         reasoningEffort: "high",
        //     },
        // },
    });

    const calls = toolCalls.map((tc) => ({
        toolName: tc.toolName,
        args: "args" in tc ? tc.args : {},
    }));

    const toolNames = toolCalls.map((tc) => tc.toolName);

    return {
        toolCalls,
        toolNames,
        selectedAny: toolNames.length > 0,
    };
};
