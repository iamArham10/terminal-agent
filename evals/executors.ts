import {
    type EvalData,
    type MultiTurnEvalData,
    type MultiTurnResult,
    type SingleTurnResult,
} from "./types";
import {
    generateText,
    stepCountIs,
    tool,
    type ModelMessage,
    type ToolSet,
} from "ai";
import { openai } from "@ai-sdk/openai";
import z from "zod";

import { buildMessages, buildMockedTools } from "./utils";
import { SYSTEM_PROMPT } from "../src/agent/system/prompt";
import type { openai } from "@ai-sdk/openai";

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
        model: openai(data.config?.model ?? "gpt-4o-mini"),
        messages,
        tools,
        stopWhen: stepCountIs(1),
        temperature: data.config?.temperature ?? undefined,
        providerOptions: {
            openai: {
                reasoningEffort: "medium",
            },
        },
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

export async function multiTurnWithMock(
    data: MultiTurnEvalData,
): Promise<MultiTurnResult> {
    const tools = buildMockedTools(data.mockTools);

    const messages: ModelMessage[] = data.messages ?? [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: data.prompt! },
    ];

    const result = await generateText({
        model: openai("gpt-4o-mini"),
        messages,
        tools,
        stopWhen: stepCountIs(data.config?.maxSteps ?? 20),
    });

    // extract all the tool calls
    const allToolCalls: string[] = [];
    const steps = result.steps.map((step) => {
        const stepToolCalls = (step.toolCalls ?? []).map((tc) => {
            allToolCalls.push(tc.toolName);
            return { toolName: tc.toolName, args: "args" in tc ? tc.args : {} };
        });

        const stepToolResults = (step.toolResults ?? []).map((tr) => ({
            toolName: tr.toolName,
            result: "result" in tr ? tr.result : tr,
        }));

        return {
            toolCalls: stepToolCalls.length > 0 ? stepToolCalls : undefined,
            toolResults:
                stepToolResults.length > 0 ? stepToolResults : undefined,
            text: step.text || undefined,
        };
    });

    const toolsUsed = [...new Set(allToolCalls)];
    return {
        text: result.text,
        steps,
        toolsUsed,
        toolCallOrder: allToolCalls,
    };
}
