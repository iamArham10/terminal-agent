import { streamText, type LanguageModel, type ModelMessage, type ToolSet } from "ai";
import type { AgentCallbacks, ToolCallInfo } from "../types.ts";

interface PendingToolCall extends ToolCallInfo {
  providerExecuted: boolean;
}

export interface AgentLoopOptions {
  model: LanguageModel;
  tools: ToolSet;
  messages: ModelMessage[];
  callbacks: AgentCallbacks;
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>;
  onHistoryChange?: (messages: ModelMessage[]) => void;
  telemetry?: Parameters<typeof streamText>[0]["experimental_telemetry"];
}

export function toolsWithoutExecution(tools: ToolSet): ToolSet {
  return Object.fromEntries(Object.entries(tools).map(([name, tool]) => {
    const { execute: _execute, ...definition } = tool;
    return [name, definition];
  })) as ToolSet;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function inspectResponse(response: ModelMessage[], calls: PendingToolCall[]): Map<string, string> {
  const expected = new Map(calls.map((call) => [call.toolCallId, call]));
  const seen = new Set<string>();
  const providerResults = new Map<string, string>();
  for (const message of response) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === "tool-call") {
        const call = expected.get(part.toolCallId);
        if (!call || call.toolName !== part.toolName || seen.has(part.toolCallId)) {
          throw new Error("Model response contains an unexpected or duplicate tool call.");
        }
        seen.add(part.toolCallId);
      } else if (part.type === "tool-result") {
        const call = expected.get(part.toolCallId);
        if (!call?.providerExecuted || call.toolName !== part.toolName || !seen.has(part.toolCallId) || providerResults.has(part.toolCallId)) {
          throw new Error("Model response contains an unexpected tool result.");
        }
        providerResults.set(part.toolCallId, part.output.type === "text" || part.output.type === "error-text"
          ? part.output.value : JSON.stringify(part.output));
      }
    }
  }
  if (seen.size !== calls.length || calls.some((call) => call.providerExecuted && !providerResults.has(call.toolCallId))) {
    throw new Error("Model response contains incomplete tool calls.");
  }
  return providerResults;
}

/** The SDK may generate local calls, but only this loop may execute them. */
export async function runAgentLoop(options: AgentLoopOptions): Promise<ModelMessage[]> {
  const { callbacks } = options;
  const messages = [...options.messages];
  const definitions = toolsWithoutExecution(options.tools);
  const usedIds = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content) {
      if (part.type === "tool-call") usedIds.add(part.toolCallId);
    }
  }
  let fullResponse = "";
  options.onHistoryChange?.(messages);

  while (true) {
    const abort = new AbortController();
    const result = streamText({
      model: options.model, messages, tools: definitions,
      abortSignal: abort.signal,
      experimental_telemetry: options.telemetry,
    });
    // Attach rejection handlers immediately, including when iteration/approval
    // fails. The SDK's result promises and stream must both complete successfully.
    const completion = Promise.all([result.finishReason, result.response]).then(
      ([finishReason, response]) => ({ finishReason, response }),
      (error: unknown) => ({ error: asError(error) }),
    );
    const calls: PendingToolCall[] = [];
    let denied = false;
    let streamError: Error | undefined;
    let currentText = "";

    try {
      for await (const chunk of result.fullStream) {
        if (chunk.type === "error" || chunk.type === "tool-error") {
          streamError ??= asError(chunk.error);
        } else if (chunk.type === "abort") {
          streamError ??= new Error("Model stream was aborted.");
        } else if (chunk.type === "text-delta") {
          currentText += chunk.text;
          callbacks.onToken(chunk.text);
        } else if (chunk.type === "tool-call") {
          if (chunk.invalid) {
            streamError ??= asError(chunk.error);
            continue;
          }
          if (usedIds.has(chunk.toolCallId)) {
            streamError ??= new Error("Model reused a tool-call ID; refusing to execute it again.");
            continue;
          }
          usedIds.add(chunk.toolCallId);
          const call: PendingToolCall = {
            toolCallId: chunk.toolCallId, toolName: chunk.toolName,
            args: chunk.input as Record<string, unknown>,
            providerExecuted: chunk.providerExecuted === true,
          };
          calls.push(call);
          callbacks.onToolCallStart(call.toolName, call.args);
          // Provider-executed calls are already remote side effects; never pretend
          // that local approval gates them or dispatch them through executeTool.
          if (!call.providerExecuted && !denied && !streamError) {
            denied = !(await callbacks.onToolApproval(call.toolName, call.args));
          }
          // A denial cancels the batch, not consumption. Later calls still need
          // cancellation results so the resulting history has no dangling calls.
        }
      }
    } catch (error) {
      streamError ??= asError(error);
      abort.abort();
    }

    const completed = await completion;
    if (streamError) throw streamError;
    if ("error" in completed) throw completed.error;
    const { finishReason, response } = completed;
    if (finishReason !== "stop" && finishReason !== "tool-calls") {
      throw new Error(`Model turn did not complete (finish reason: ${finishReason}).`);
    }
    const localCalls = calls.filter((call) => !call.providerExecuted);
    if ((finishReason === "tool-calls" && !calls.length) || (finishReason === "stop" && localCalls.length)) {
      throw new Error("Model finish reason does not match its tool calls.");
    }
    const providerResults = inspectResponse(response.messages, calls);
    messages.push(...response.messages);
    fullResponse += currentText;
    for (const call of calls.filter((call) => call.providerExecuted)) {
      callbacks.onToolCallEnd(call.toolName, `Executed by provider: ${providerResults.get(call.toolCallId)}`);
    }

    for (const call of localCalls) {
      const output = denied
        ? "Cancelled: a tool in this batch was declined; no local tools in this batch were executed."
        : await options.executeTool(call.toolName, call.args);
      messages.push({ role: "tool", content: [{
        type: "tool-result", toolCallId: call.toolCallId, toolName: call.toolName,
        output: { type: "text", value: output },
      }] });
      callbacks.onToolCallEnd(call.toolName, output);
    }

    if (denied) {
      const refusal = "Tool batch cancelled because you declined a tool. No local tools in this batch were executed.";
      messages.push({ role: "assistant", content: refusal });
      const suffix = `${fullResponse ? "\n\n" : ""}${refusal}`;
      fullResponse += suffix;
      callbacks.onToken(suffix);
      options.onHistoryChange?.(messages);
      break;
    }
    options.onHistoryChange?.(messages);
    if (finishReason === "stop") break;
  }

  callbacks.onComplete(fullResponse);
  return messages.filter((message) => message.role !== "system");
}
