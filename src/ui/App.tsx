import React, { useState, useCallback, useRef } from "react";
import { Box, Text, useApp } from "ink";
import { runAgent } from "../agent/run.ts";
import { MessageList, type Message } from "./components/MessageList.tsx";
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

interface ActiveToolCall extends ToolCallProps {
    id: string;
}

interface AppProps {
    initialSession: SavedSession;
    sessionStore: SessionStore;
}

export function App({ initialSession, sessionStore }: AppProps) {
    const { exit } = useApp();
    const sessionRef = useRef(initialSession);
    const busyRef = useRef(false);
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
            if (busyRef.current) return;
            if (
                userInput.toLowerCase() === "exit" ||
                userInput.toLowerCase() === "quit"
            ) {
                exit();
                return;
            }

            busyRef.current = true;
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

            try {
                const newHistory = await runAgent(userInput, current.history, {
                    onToken: (token) => {
                        setStreamingText((prev) => prev + token);
                    },
                    onToolCallStart: (name, args) => {
                        setActiveToolCalls((prev) => [
                            ...prev,
                            {
                                id: `${name}-${++toolId.current}`,
                                name,
                                args,
                                status: "pending",
                            },
                        ]);
                    },
                    onToolCallEnd: (name, result) => {
                        setActiveToolCalls((prev) => {
                            const index = prev.findIndex(
                                (tc) =>
                                    tc.name === name && tc.status === "pending",
                            );
                            return prev.map((tc, i) =>
                                i === index
                                    ? { ...tc, status: "complete", result }
                                    : tc,
                            );
                        });
                    },
                    onComplete: (response) => {
                        if (response) {
                            turnMessages.push({
                                role: "assistant",
                                content: response,
                            });
                            setMessages([...turnMessages]);
                        }
                        setStreamingText("");
                        setActiveToolCalls([]);
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
                turnMessages.push({
                    role: "assistant",
                    content: `Error: ${errorMessage}`,
                });
                sessionRef.current = { ...current, messages: turnMessages };
                setMessages([...turnMessages]);
            } finally {
                setStreamingText("");
                setActiveToolCalls([]);
                busyRef.current = false;
                setIsLoading(false);
            }
        },
        [sessionStore, exit],
    );

    return (
        <Box flexDirection="column" padding={1}>
            <Box marginBottom={1}>
                <Text bold color="magenta">
                    🤖 AI Agent
                </Text>
                <Text dimColor> (type "exit" to quit)</Text>
            </Box>

            <Text dimColor>Session: {initialSession.id}</Text>
            {saveWarning && <Text color="yellow">{saveWarning}</Text>}

            <Box flexDirection="column" marginBottom={1}>
                <MessageList messages={messages} />

                {streamingText && (
                    <Box flexDirection="column" marginTop={1}>
                        <Text color="green" bold>
                            › Assistant
                        </Text>
                        <Box marginLeft={2}>
                            <Text>{streamingText}</Text>
                            <Text color="gray">▌</Text>
                        </Box>
                    </Box>
                )}

                {activeToolCalls.length > 0 && !pendingApproval && (
                    <Box flexDirection="column" marginTop={1}>
                        {activeToolCalls.map((tc) => (
                            <ToolCall
                                key={tc.id}
                                name={tc.name}
                                args={tc.args}
                                status={tc.status}
                                result={tc.result}
                            />
                        ))}
                    </Box>
                )}

                {isLoading &&
                    !streamingText &&
                    activeToolCalls.length === 0 &&
                    !pendingApproval && (
                        <Box marginTop={1}>
                            <Spinner />
                        </Box>
                    )}

                {pendingApproval && (
                    <ToolApproval
                        toolName={pendingApproval.toolName}
                        args={pendingApproval.args}
                        onResolve={(approved) => {
                            pendingApproval.resolve(approved);
                            setPendingApproval(null);
                        }}
                    />
                )}
            </Box>

            {!pendingApproval && (
                <Input onSubmit={handleSubmit} disabled={isLoading} />
            )}

            <TokenUsage usage={tokenUsage} />
        </Box>
    );
}
