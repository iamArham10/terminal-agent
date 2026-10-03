import type { ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { getTracer, Laminar } from "@lmnr-ai/lmnr";
import { tools } from "./tools/index.ts";
import { executeTool } from "./executeTool.ts";
import { buildSystemPrompt } from "./system/prompt.ts";
import type { AgentCallbacks } from "../types.ts";
import {
    estimateMessagesTokens,
    getModelLimits,
    isOverThreshold,
    calculateUsagePercentage,
    compactConversation,
    DEFAULT_THRESHOLD,
} from "./context/index.ts";
import { filterCompatibleMessages } from "./system/filterMessages.ts";
import { runAgentLoop } from "./loop.ts";

const tracingEnabled = Boolean(process.env.LMNR_API_KEY);
if (tracingEnabled) {
    Laminar.initialize({ projectApiKey: process.env.LMNR_API_KEY });
}

const MODEL_NAME = process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";

export async function runAgent(
    userMessage: string,
    conversationHistory: ModelMessage[],
    callbacks: AgentCallbacks,
): Promise<ModelMessage[]> {
    const modelLimits = getModelLimits(MODEL_NAME);
    const SYSTEM_PROMPT = await buildSystemPrompt();
    // Rebuild project context rather than accumulating stale system prompts.
    let workingHistory = filterCompatibleMessages(
        conversationHistory.filter((message) => message.role !== "system"),
    );
    const preCheckTokens = estimateMessagesTokens([
        { role: "system", content: SYSTEM_PROMPT },
        ...workingHistory,
        { role: "user", content: userMessage },
    ]);
    if (isOverThreshold(preCheckTokens.total, modelLimits.contextWindow)) {
        workingHistory = await compactConversation(workingHistory, MODEL_NAME);
    }
    const messages: ModelMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...workingHistory,
        { role: "user", content: userMessage },
    ];
    return runAgentLoop({
        model: openai.responses(MODEL_NAME),
        tools,
        messages,
        callbacks,
        executeTool,
        telemetry: tracingEnabled
            ? { isEnabled: true, tracer: getTracer() }
            : undefined,
        onHistoryChange: (history) => {
            if (!callbacks.onTokenUsage) return;
            const usage = estimateMessagesTokens(history);
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
        },
    });
}
