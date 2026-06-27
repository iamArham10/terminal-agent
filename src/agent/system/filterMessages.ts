import type { ModelMessage } from "ai";

export const filterCompatibleMessages = (
  messages: ModelMessage[],
): ModelMessage[] => {
  // Collect IDs of tool-calls that are in kept assistant messages
  const keptToolCallIds = new Set<string>();

  // First pass: identify which assistant messages to keep
  // and collect their tool-call IDs
  const assistantDecisions = new Map<number, boolean>();

  messages.forEach((msg, idx) => {
    if (msg.role === "assistant") {
      const content = msg.content;

      if (typeof content === "string" && content.trim()) {
        assistantDecisions.set(idx, true);
        return;
      }

      if (Array.isArray(content)) {
        const hasUsableContent = content.some((part: unknown) => {
          if (typeof part === "string" && part.trim()) return true;
          if (typeof part === "object" && part !== null) {
            const p = part as { type?: string; text?: string };
            // Keep tool-call parts — they pair with tool messages
            if (p.type === "tool-call") return true;
            if (p.text && p.text.trim()) return true;
          }
          return false;
        });

        if (hasUsableContent) {
          assistantDecisions.set(idx, true);

          // Collect IDs of tool-calls in this message
          content.forEach((part: unknown) => {
            if (
              typeof part === "object" &&
              part !== null &&
              "type" in part &&
              (part as { type: string }).type === "tool-call" &&
              "toolCallId" in part
            ) {
              keptToolCallIds.add((part as { toolCallId: string }).toolCallId);
            }
          });
        } else {
          assistantDecisions.set(idx, false);
        }
      } else {
        assistantDecisions.set(idx, false);
      }
    }
  });

  // Second pass: filter messages
  return messages.filter((msg, idx) => {
    if (msg.role === "user" || msg.role === "system") {
      return true;
    }

    if (msg.role === "assistant") {
      return assistantDecisions.get(idx) ?? false;
    }

    // Only keep tool messages whose tool-call ID is in a kept assistant message
    if (msg.role === "tool") {
      const content = msg.content;
      if (Array.isArray(content)) {
        return content.some((part: unknown) => {
          if (
            typeof part === "object" &&
            part !== null &&
            "toolCallId" in part
          ) {
            return keptToolCallIds.has(
              (part as { toolCallId: string }).toolCallId,
            );
          }
          return false;
        });
      }
      return false;
    }

    return false;
  });
};
