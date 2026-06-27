import { streamText, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { getTracer } from "@lmnr-ai/lmnr";
import { tools } from "./tools/index.ts";
import { executeTool } from "./executeTool.ts";
import { buildSystemPrompt } from "./system/prompt.ts";
import { Laminar } from "@lmnr-ai/lmnr";
import type { AgentCallbacks, ToolCallInfo } from "../types.ts";
import {
    estimateMessagesTokens,
    getModelLimits,
    isOverThreshold,
    calculateUsagePercentage,
    compactConversation,
    DEFAULT_THRESHOLD,
} from "./context/index.ts";
import { filterCompatibleMessages } from "./system/filterMessages.ts";

Laminar.initialize({
    projectApiKey: process.env.LMNR_API_KEY,
});

const MODEL_NAME = "gpt-5-mini";

export async function runAgent(
    userMessage: string,
    conversationHistory: ModelMessage[],
    callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
    const modelLimits = getModelLimits(MODEL_NAME);
    const SYSTEM_PROMPT = await buildSystemPrompt();

    // Filter and check if we need to compact the conversation history before starting
    let workingHistory = filterCompatibleMessages(conversationHistory);
    const preCheckTokens = estimateMessagesTokens([
        { role: "system", content: SYSTEM_PROMPT },
        ...workingHistory,
        { role: "user", content: userMessage },
    ]);

    if (isOverThreshold(preCheckTokens.total, modelLimits.contextWindow)) {
        // Compact the conversation
        workingHistory = await compactConversation(workingHistory, MODEL_NAME);
    }

    const messages: ModelMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...workingHistory,
        { role: "user", content: userMessage },
    ];

    let fullResponse = "";

    // Report initial token usage
    const reportTokenUsage = () => {
        if (callbacks.onTokenUsage) {
            const usage = estimateMessagesTokens(messages);
            callbacks.onTokenUsage({
                inputTokens: usage.input,
                outputTokens: usage.output,
                totalTokens: usage.total,
                contextWindow: modelLimits.contextWindow,
                threshold: DEFAULT_THRESHOLD,
                percentage: calculateUsagePercentage(
                    usage.total,
                    modelLimits.contextWindow,
                ),
            });
        }
    };

    reportTokenUsage();

    while (true) {
        const result = streamText({
            model: openai(MODEL_NAME),
            messages,
            tools,
            experimental_telemetry: {
                isEnabled: true,
                tracer: getTracer(),
            },
        });

        const toolCalls: ToolCallInfo[] = [];
        let currentText = "";
        let streamError: Error | null = null;
        let rejected = false;

        try {
            for await (const chunk of result.fullStream) {
                if (chunk.type === "text-delta") {
                    currentText += chunk.text;
                    callbacks.onToken(chunk.text);
                }

                if (chunk.type === "tool-call") {
                    const input = "input" in chunk ? chunk.input : {};

                    toolCalls.push({
                        toolCallId: chunk.toolCallId,
                        toolName: chunk.toolName,
                        args: input as Record<string, unknown>,
                    });
                    callbacks.onToolCallStart(chunk.toolName, input);

                    const approved = await callbacks.onToolApproval(
                        chunk.toolName,
                        input,
                    );
                    if (!approved) {
                        rejected = true;
                        break;
                    }
                }
            }
        } catch (error) {
            streamError = error as Error;
            if (
                !currentText &&
                !streamError.message.includes("No output generated")
            ) {
                throw streamError;
            }
        }

        fullResponse += currentText;

        if (streamError && !currentText) {
            fullResponse =
                "I apologize, but I wasn't able to generate a response. Could you please try rephrasing your message?";
            callbacks.onToken(fullResponse);
            break;
        }

        if (rejected) {
            break;
        }

        let finishReason: string;
        let responseMessages: Awaited<typeof result.response>;

        try {
            finishReason = await result.finishReason;
            responseMessages = await result.response;
        } catch {
            // Stream failed — treat as a stop with no extra messages
            break;
        }

        // Push the assistant message(s) BEFORE tool results
        messages.push(...responseMessages.messages);

        if (toolCalls.length > 0) {
            for (const tc of toolCalls) {
                if (finishReason === "tool-calls") {
                    const result = await executeTool(tc.toolName, tc.args);
                    callbacks.onToolCallEnd(tc.toolName, result);

                    messages.push({
                        role: "tool",
                        content: [
                            {
                                type: "tool-result",
                                toolCallId: tc.toolCallId,
                                toolName: tc.toolName,
                                output: { type: "text", value: result },
                            },
                        ],
                    });
                } else {
                    callbacks.onToolCallEnd(
                        tc.toolName,
                        "Executed by provider",
                    );
                }
                reportTokenUsage();
            }
        }
        reportTokenUsage();

        if (finishReason !== "tool-calls") {
            break;
        }
    }

    callbacks.onComplete(fullResponse);

    return messages;
}
