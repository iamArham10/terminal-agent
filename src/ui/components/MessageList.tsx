import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { markdownLines, type RenderLine } from "../helpers.ts";
import { theme } from "../theme.ts";

export interface Message {
	role: "user" | "assistant" | "error";
	content: string;
}
export function conversationLines(
	messages: Message[],
	width: number,
): RenderLine[] {
	return messages.flatMap((message, index) => [
		...(index ? [{ text: "", kind: "muted" as const }] : []),
		{
			text:
				message.role === "user"
					? "YOU"
					: message.role === "error"
						? "ERROR"
						: "AGENT",
			kind: message.role,
		},
		...markdownLines(message.content, width),
	]);
}
export function InlineText({ text }: { text: string }) {
	return (
		<>
			{text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
				part.startsWith("`") && part.endsWith("`") ? (
					<Text key={i} color={theme.accent}>
						{part.slice(1, -1)}
					</Text>
				) : part.startsWith("**") && part.endsWith("**") ? (
					<Text key={i} bold>
						{part.slice(2, -2)}
					</Text>
				) : (
					<Text key={i}>{part}</Text>
				),
			)}
		</>
	);
}
export function MessageList({
	messages,
	width = 76,
	height,
	scroll = 0,
	renderedLines,
}: {
	renderedLines?: RenderLine[];
	messages: Message[];
	width?: number;
	height?: number;
	scroll?: number;
}) {
	const computedLines = useMemo(
		() => renderedLines ?? conversationLines(messages, width),
		[renderedLines, messages, width],
	);
	const lines = computedLines;
	const count = height ?? lines.length;
	const end = Math.max(count, lines.length - scroll);
	const visible = lines.slice(Math.max(0, end - count), end);
	return (
		<Box flexDirection="column" height={height} overflow="hidden">
			{visible.map((line, index) => (
				<Text
					key={index}
					wrap="truncate"
					bold={["user", "assistant", "error", "heading"].includes(line.kind)}
					color={
						line.kind === "user" || line.kind === "heading"
							? theme.accent
							: line.kind === "assistant"
								? theme.success
								: line.kind === "error"
									? theme.danger
									: undefined
					}
					dimColor={line.kind === "muted" || line.kind === "quote"}
				>
					{line.kind === "body" ? (
						<InlineText text={line.text} />
					) : (
						line.text || " "
					)}
				</Text>
			))}
		</Box>
	);
}
