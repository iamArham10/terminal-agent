import { exec } from "child_process";
import { tools } from "./tools/index.ts";

export type ToolName = keyof typeof tools;

export async function executeTool(
    name: string,
    toolCallId: string,
    args: any,
): Promise<string> {
    const tool = tools[name as ToolName];

    if (!tool) {
        return `Unknown tool: ${tool}`;
    }

    const execute = tool.execute;
    if (!execute) {
        return `Provider tool ${name} - executed my model provide`;
    }

    const result = await execute(args as any, {
        toolCallId: toolCallId ? toolCallId : "",
        messages: [],
    });

    return String(result);
}
