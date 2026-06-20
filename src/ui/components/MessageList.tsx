import React from 'react';
import { Box, Text } from 'ink';
import { ToolCall } from './ToolCall.js';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { name: string; args: any; result?: any }[];
}

interface MessageListProps {
  messages: Message[];
}

export function MessageList({ messages }: MessageListProps) {
  return (
    <Box flexDirection="column" gap={1}>
      {messages.map((message, index) => (
        <Box key={index} flexDirection="column">
          <Text color={message.role === 'user' ? 'blue' : 'green'} bold>
            {message.role === 'user' ? '› You' : '› Assistant'}
          </Text>
          {message.toolCalls && message.toolCalls.map((tc, idx) => (
             <ToolCall key={idx} name={tc.name} args={tc.args} status="complete" result={typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result)} />
          ))}
          {message.content && (
            <Box marginLeft={2} marginTop={message.toolCalls?.length ? 1 : 0}>
              <Text>{message.content}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
