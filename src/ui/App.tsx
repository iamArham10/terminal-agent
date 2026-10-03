import React, { useState, useCallback, useMemo, useRef } from "react";
import { Box, Text, useApp, useInput } from "ink";
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
import type {
    ToolApprovalRequest,
    TokenUsageInfo,
    SavedSession,
} from "../types.ts";
import { type SessionStore, sessionTitle } from "../sessions/store.ts";
import { clip } from "./helpers.ts";
import { theme } from "./theme.ts";
import { useTerminalSize } from "./useTerminalSize.ts";
import { ragSourceDisplay } from "./ragSources.ts";

interface ActiveToolCall extends ToolCallProps {
    id: string;
}

interface AppProps {
    initialSession: SavedSession;
    sessionStore: SessionStore;
}

export function App({ initialSession, sessionStore }: AppProps) {
    const { exit } = useApp();
    const { columns, rows } = useTerminalSize();
    const width = Math.max(8, columns - 2);
    const compact = rows < 20;
    const [scroll, setScroll] = useState(0);
    const sessionRef = useRef(initialSession);
    const running = useRef(false);
    const toolId = useRef(0);
    const [messages, setMessages] = useState<Message[]>(
        initialSession.messages,
    );
    const [saveWarning, setSaveWarning] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [streamingText, setStreamingText] = useState("");
    const [activeToolCalls, setActiveToolCalls] = useState<ActiveToolCall[]>(
        [],
    );
    const [pendingApproval, setPendingApproval] =
        useState<ToolApprovalRequest | null>(null);
    const [tokenUsage, setTokenUsage] = useState<TokenUsageInfo | null>(
        initialSession.tokenUsage,
    );

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
            const current = sessionRef.current;
            const turnMessages: Message[] = [
                ...current.messages,
                { role: "user", content: userInput },
            ];
            let latestUsage = current.tokenUsage;
            setMessages([...turnMessages]);
            setIsLoading(true);
            setStreamingText("");
            setActiveToolCalls([]);

            let partialResponse = "";
            const retrievedSources = new Set<string>();
            const withRetrievedSources = (response: string): string => {
                if (!retrievedSources.size) return response;
                const section = [
                    "## Retrieved sources",
                    "These sources were retrieved, not necessarily used in the response.",
                    [...retrievedSources]
                        .map((label) => `- ${label}`)
                        .join("\n"),
                ].join("\n\n");
                return response ? `${response}\n\n${section}` : section;
            };
            try {
                const newHistory = await runAgent(userInput, current.history, {
                    onToken: (token) => {
                        partialResponse += token;
                        setStreamingText((prev) => prev + token);
                    },
                    onToolCallStart: (name, args) => {
                        const id = `${name}-${++toolId.current}`;
                        setActiveToolCalls((prev) => [
                            ...prev,
                            { id, name, args, status: "pending" },
                        ]);
                    },
                    onToolCallEnd: (name, result) => {
                        if (name === "ragSearch") {
                            const sources = ragSourceDisplay(result);
                            if (sources?.startsWith("Sources:\n  ")) {
                                for (const label of sources
                                    .split("\n  ")
                                    .slice(1)) {
                                    retrievedSources.add(label);
                                }
                            }
                        }
                        setActiveToolCalls((prev) => {
                            const index = prev.findIndex(
                                (tc) =>
                                    tc.name === name && tc.status === "pending",
                            );
                            return prev.map((tc, i) =>
                                i === index
                                    ? {
                                          ...tc,
                                          status: result.startsWith(
                                              "Cancelled:",
                                          )
                                              ? "denied"
                                              : "complete",
                                          result,
                                      }
                                    : tc,
                            );
                        });
                    },
                    onComplete: (response) => {
                        const content = withRetrievedSources(response);
                        partialResponse = "";
                        setStreamingText("");
                        if (content) {
                            turnMessages.push({ role: "assistant", content });
                            setMessages([...turnMessages]);
                        }
                        retrievedSources.clear();
                    },
                    onToolApproval: (name, args) => {
                        return new Promise<boolean>((resolve) => {
                            setPendingApproval({
                                toolName: name,
                                args,
                                resolve,
                            });
                        });
                    },
                    onTokenUsage: (usage) => {
                        latestUsage = usage;
                        setTokenUsage(usage);
                    },
                });

                // Only a successfully completed loop may advance the resumable history.
                const checkpoint: SavedSession = {
                    ...current,
                    title:
                        current.revision === 0 &&
                        current.title === "New conversation"
                            ? sessionTitle(userInput)
                            : current.title,
                    history: newHistory,
                    messages: turnMessages,
                    tokenUsage: latestUsage,
                };
                sessionRef.current = checkpoint;
                try {
                    sessionRef.current = await sessionStore.save(checkpoint);
                    setSaveWarning(null);
                } catch (error) {
                    setSaveWarning(
                        `Session not saved: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : "Unknown error";
                const content = withRetrievedSources(partialResponse);
                if (content) {
                    turnMessages.push({ role: "assistant", content });
                }
                turnMessages.push({ role: "error", content: errorMessage });
                // Keep failed output for display, but never checkpoint incomplete tool work.
                sessionRef.current = { ...current, messages: turnMessages };
                setMessages([...turnMessages]);
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
        [sessionStore, exit],
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
                    Math.max(
                        0,
                        effectiveScroll - Math.max(1, transcriptHeight - 1),
                    ),
                );
        },
        { isActive: !pendingApproval },
    );

    const stateLabel = pendingApproval
        ? "Approval needed"
        : isLoading
          ? "Working"
          : "Ready";
    const sessionLabel = `${sessionRef.current.id.slice(0, 8)} · ${sessionRef.current.title}`;
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
                    {clip(
                        stateLabel,
                        Math.max(4, width - (columns < 30 ? 4 : 22)),
                    )}
                </Text>
            </Box>
            <Text dimColor>
                {clip(
                    effectiveScroll
                        ? `${sessionRef.current.id.slice(0, 8)} · History · ${effectiveScroll} lines above latest · PgDn to return`
                        : sessionLabel,
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
                                {clip(
                                    "Your workspace, in conversation.",
                                    width,
                                )}
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
                                        {clip(
                                            "Try: Explain the structure of this project",
                                            width,
                                        )}
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
                        {saveWarning ? (
                            <Text color={theme.warning}>
                                {clip(saveWarning, width)}
                            </Text>
                        ) : isLoading ? (
                            <Spinner
                                label={
                                    streamingText
                                        ? "Writing response…"
                                        : "Thinking…"
                                }
                            />
                        ) : (
                            <Text dimColor>
                                {clip(
                                    "Enter a message · exit / quit to leave",
                                    width,
                                )}
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
