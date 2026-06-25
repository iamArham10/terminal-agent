import type { ModelMessage } from "ai";
export const filterCompatibleMessages = (
    messages: ModelMessage[],
): ModelMessage[] => {
    return messages.filter((msg) => {
        // Keep user and system messages
        if (msg.role === "user" || msg.role === "system") {
            return true;
        }

        // Keep assistant messages that have text content
        if (msg.role === "assistant") {
            const content = msg.content;
            if (typeof content === "string" && content.trim()) {
                return true;
            }
            // Check for array content with text parts
            if (Array.isArray(content)) {
                const hasTextContent = content.some((part: unknown) => {
                    if (typeof part === "string" && part.trim()) return true;
                    if (
                        typeof part === "object" &&
                        part !== null &&
                        "text" in part
                    ) {
                        const textPart = part as { text?: string };
                        return textPart.text && textPart.text.trim();
                    }
                    return false;
                });
                return hasTextContent;
            }
        }

        // Keep tool messages
        if (msg.role === "tool") {
            return true;
        }

        return false;
    });
};
