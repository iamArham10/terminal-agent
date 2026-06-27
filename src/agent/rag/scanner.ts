import path from "node:path";
import fs from "node:fs/promises";
import { ragConfig } from "./config.js";
import fg from "fast-glob";

export async function scanDirectory(
  directory = process.cwd(),
): Promise<string[]> {
  const rootDirectory = path.resolve(directory);

  const stat = await fs.stat(rootDirectory).catch(() => {
    throw new Error(`Directory does not exist: ${rootDirectory}`);
  });

  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${rootDirectory}`);
  }

  // create a regex pattern for searching files of supported Extensions
  const patterns = ragConfig.supportedExtensions.map((extension: string) => {
    const cleanExtension = extension.replace(/^\./, "");
    return `**/*.${cleanExtension}`;
  });

  const ignorePatterns = ragConfig.ignoreDirectories.map(
    (directoryName: string) => {
      return `**/${directoryName}/**`;
    },
  );

  const files = await fg(patterns, {
    cwd: rootDirectory,
    absolute: true,
    onlyFiles: true,
    unique: true,

    dot: false,
    ignore: ignorePatterns,

    caseSensitiveMatch: false,
  });

  return files.sort();
}
