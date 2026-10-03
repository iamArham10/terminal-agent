import React from "react";
import { Text } from "ink";
import InkSpinner from "ink-spinner";
import { argsSummary, clip } from "../helpers.ts";
import { theme } from "../theme.ts";
import { ragSourceDisplay } from "../ragSources.ts";

export interface ToolCallProps {
    name: string;
    args?: unknown;
    status: "pending" | "complete" | "denied" | "failed";
    result?: string;
    width?: number;
}
export function ToolCall({
    name,
    args,
    status,
    result,
    width = 80,
}: ToolCallProps) {
    const sources =
        name === "ragSearch" && status === "complete" && result
            ? ragSourceDisplay(result)
            : undefined;
    const sourceCount = sources?.startsWith("Sources:\n  ")
        ? sources.split("\n  ").length - 1
        : 0;
    const summary = sources
        ? sourceCount
            ? `${sourceCount} retrieved source${sourceCount === 1 ? "" : "s"} · see transcript`
            : sources
        : (status === "complete" || status === "failed") && result
          ? clip(result, width)
          : argsSummary(args, width);
    return (
        <Text wrap="truncate">
            <Text
                color={
                    status === "complete"
                        ? theme.success
                        : status === "failed" || status === "denied"
                          ? theme.danger
                          : theme.warning
                }
            >
                {status === "pending" ? (
                    <InkSpinner type="dots" />
                ) : status === "complete" ? (
                    "✓"
                ) : (
                    "×"
                )}
            </Text>{" "}
            <Text bold>{clip(name, 24)}</Text>
            <Text dimColor>{` · ${status} · ${summary}`}</Text>
        </Text>
    );
}
