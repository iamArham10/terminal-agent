import { readFile, writeFile, listFiles, deleteFile } from "./file.js";
import { webSearch } from "./webSearch.js";
import { runCommand } from "./shell.js";
import { ragSearch } from "./ragSearch.js";

// All tools combined for the agent
export const tools = {
    readFile,
    writeFile,
    listFiles,
    deleteFile,
    webSearch,
    runCommand,
    ragSearch,
};

// Export individual tools for selective use in evals
export { readFile, writeFile, listFiles, deleteFile } from "./file.ts";

export { webSearch } from "./webSearch.js";

export { runCommand } from "./shell.js";

export { ragSearch } from "./ragSearch.js";

// Tool sets for evals
export const fileTools = {
    readFile,
    writeFile,
    listFiles,
    deleteFile,
};
