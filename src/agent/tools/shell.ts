import { tool } from "ai";
import z from "zod";
import shell from "shelljs";

export const runCommand = tool({
    description:
        "Execute a shell command and return its output. Use this for system operations, running scripts, or interacting with the operating system.",
    inputSchema: z.object({
        command: z.string().describe("The shell command you want to execute"),
    }),
    execute: async ({ command }) => {
        const result = shell.exec(command, { silent: true });
        let output = "";
        if (result.stdout) {
            output += result.stdout;
        }

        if (result.stderr) {
            output += result.stderr;
        }
        if (result.code !== 0) {
            return `Command failed to execute (exit code ${result.code}):\n${output}`;
        }
        return output || "Command completed successfully (no output)";
    },
});
