import React, { useState, useCallback, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
import type { ModelMessage } from "ai";
import { runAgent } from "../agent/run.ts";
import {
	MessageList,
	conversationLines,
	type Message,
} from "./components/MessageList.tsx";
import { ToolCall, type ToolCallProps } from "./components/ToolCall.tsx";
import { Spinner } from "./components/Spinner.tsx";
import { Input } from "./components/Input.tsx";
import { ToolApproval } from "./components/ToolApproval.tsx";
import { TokenUsage } from "./components/TokenUsage.tsx";
import type { ToolApprovalRequest, TokenUsageInfo } from "../types.ts";

import { clip } from "./helpers.ts";
import { theme } from "./theme.ts";
import { useTerminalSize } from "./useTerminalSize.ts";

interface ActiveToolCall extends ToolCallProps {
	id: string;
}

export function App() {
	const { exit } = useApp();
	const { columns, rows } = useTerminalSize();
	const width = Math.max(8, columns - 2);
	const compact = rows < 20;
	const [scroll, setScroll] = useState(0);
	const running = useRef(false);
	const toolId = useRef(0);
	const [messages, setMessages] = useState<Message[]>([]);
	const [conversationHistory, setConversationHistory] = useState<
		ModelMessage[]
	>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [streamingText, setStreamingText] = useState("");
	const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>([]);
	const [pendingApproval, setPendingApproval] =
		useState<ToolApprovalRequest | null>(null);
	const [tokenUsage, setTokenUsage] = useState<TokenUsageInfo | null>(null);

	const handleSubmit = useCallback(
		async (userInput: string) => {
			if (running.current) return;
			if (
				userInput.toLowerCase() === "exit" ||
				userInput.toLowerCase() === "quit"
			) {
				exit();
				return;
			}

			running.current = true;
			setScroll(0);
			setMessages((prev) => [...prev, { role: "user", content: userInput }]);
			setIsLoading(true);
			setStreamingText("");
			setActiveToolCalls([]);

			let partialResponse = "";
			try {
				const newHistory = await runAgent(userInput, conversationHistory, {
					onToken: (token) => {
						partialResponse += token;
						setStreamingText((prev) => prev + token);
					},
					onToolCallStart: (name, args) => {
						const id = `${name}-${++toolId.current}`;
						setActiveToolCalls((prev) => [
							...prev,
							{
								id,
								name,
								args,
								status: "pending",
							},
						]);
					},
					onToolCallEnd: (name, result) => {
						setActiveToolCalls((prev) => {
							const index = prev.findIndex(
								(tc) => tc.name === name && tc.status === "pending",
							);
							return prev.map((tc, i) =>
								i === index ? { ...tc, status: "complete", result } : tc,
							);
						});
					},
					onComplete: (response) => {
						if (response) {
							setMessages((prev) => [
								...prev,
								{ role: "assistant", content: response },
							]);
						}
						partialResponse = "";
						setStreamingText("");
					},
					onToolApproval: (name, args) => {
						return new Promise<boolean>((resolve) => {
							setPendingApproval({ toolName: name, args, resolve });
						});
					},
					onTokenUsage: (usage) => {
						setTokenUsage(usage);
					},
				});

				setConversationHistory(newHistory);
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";
				setMessages((prev) => [
					...prev,
					...(partialResponse
						? [{ role: "assistant" as const, content: partialResponse }]
						: []),
					{ role: "error", content: errorMessage },
				]);
			} finally {
				running.current = false;
				setStreamingText("");
				setActiveToolCalls((prev) =>
					prev.map((tc) =>
						tc.status === "pending"
							? {
									...tc,
									status: "failed",
									result: "Run ended before tool completion",
								}
							: tc,
					),
				);
				setIsLoading(false);
			}
		},
		[conversationHistory, exit],
	);

	const displayMessages = useMemo<Message[]>(
		() =>
			streamingText
				? [...messages, { role: "assistant", content: streamingText }]
				: messages,
		[messages, streamingText],
	);
	const renderedLines = useMemo(
		() => conversationLines(displayMessages, width),
		[displayMessages, width],
	);
	const toolRows = activeToolCalls.slice(-(compact ? 1 : 3));
	const transcriptHeight = Math.max(
		1,
		rows - (compact ? 7 : 8) - (toolRows.length ? toolRows.length + 1 : 0),
	);
	const maxScroll = Math.max(0, renderedLines.length - transcriptHeight);
	const effectiveScroll = Math.min(scroll, maxScroll);
	useInput(
		(_input, key) => {
			if (key.pageUp)
				setScroll(
					Math.min(
						maxScroll,
						effectiveScroll + Math.max(1, transcriptHeight - 1),
					),
				);
			if (key.pageDown)
				setScroll(
					Math.max(0, effectiveScroll - Math.max(1, transcriptHeight - 1)),
				);
		},
		{ isActive: !pendingApproval },
	);

	const stateLabel = pendingApproval
		? "Approval needed"
		: isLoading
			? "Working"
			: "Ready";
	return (
		<Box flexDirection="column" width={columns} paddingX={1}>
			<Box justifyContent="space-between">
				<Text bold color={theme.accent}>
					{columns < 30 ? "AGI" : "AGI / terminal agent"}
				</Text>
				<Text
					color={
						pendingApproval
							? theme.warning
							: isLoading
								? theme.accent
								: theme.success
					}
				>
					{clip(stateLabel, Math.max(4, width - (columns < 30 ? 4 : 22)))}
				</Text>
			</Box>
			<Text dimColor>
				{clip(
					effectiveScroll
						? `History · ${effectiveScroll} lines above latest · PgDn to return`
						: "─".repeat(width),
					width,
				)}
			</Text>

			{pendingApproval ? (
				<ToolApproval
					key={`${pendingApproval.toolName}-${toolId.current}`}
					toolName={pendingApproval.toolName}
					args={pendingApproval.args}
					width={width}
					rows={rows}
					onResolve={(approved) => {
						pendingApproval.resolve(approved);
						if (!approved)
							setActiveToolCalls((prev) =>
								prev.map((tc) =>
									tc.status === "pending" ? { ...tc, status: "denied" } : tc,
								),
							);
						setPendingApproval(null);
					}}
				/>
			) : (
				<>
					{displayMessages.length ? (
						<MessageList
							messages={displayMessages}
							renderedLines={renderedLines}
							width={width}
							height={transcriptHeight}
							scroll={effectiveScroll}
						/>
					) : (
						<Box
							flexDirection="column"
							height={transcriptHeight}
							overflow="hidden"
							justifyContent={compact ? "flex-start" : "center"}
						>
							<Text bold color={theme.accent}>
								{clip("Your workspace, in conversation.", width)}
							</Text>
							<Text dimColor>
								{clip(
									"Ask, investigate, or build — one step at a time.",
									width,
								)}
							</Text>
							{!compact && (
								<>
									<Text> </Text>
									<Text>
										{clip("Try: Explain the structure of this project", width)}
									</Text>
									<Text>
										{clip(
											"Try: Find notes about a topic in my documents",
											width,
										)}
									</Text>
									<Text> </Text>
									<Text color={theme.warning}>
										{clip(
											"Tools wait for your approval. Nothing is auto-approved.",
											width,
										)}
									</Text>
								</>
							)}
						</Box>
					)}
					{toolRows.length > 0 && (
						<Box flexDirection="column">
							<Text dimColor>
								{clip(
									`ACTIVITY · ${activeToolCalls.length} tool${activeToolCalls.length === 1 ? "" : "s"}${activeToolCalls.length > toolRows.length ? " · latest shown" : ""}`,
									width,
								)}
							</Text>
							{toolRows.map((tc) => (
								<ToolCall key={tc.id} {...tc} width={width} />
							))}
						</Box>
					)}
					<Box height={1}>
						{isLoading ? (
							<Spinner
								label={streamingText ? "Writing response…" : "Thinking…"}
							/>
						) : (
							<Text dimColor>
								{clip("Enter a message · exit / quit to leave", width)}
							</Text>
						)}
					</Box>
				</>
			)}
			<Input
				onSubmit={handleSubmit}
				disabled={isLoading || !!pendingApproval}
				hidden={!!pendingApproval}
				width={width}
				compact={compact}
			/>
			<TokenUsage usage={tokenUsage} width={width} />
		</Box>
	);
}
