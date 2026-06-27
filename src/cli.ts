#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { render } from "ink";
import React from "react";
import { ingestDirectory } from "./agent/rag/ingest.js";
import { ragConfig } from "./agent/rag/config.js";
import { App } from "./ui/index.tsx";

type IngestCliArgs = {
  directory?: string;
  collection: string;
};

function resolveDirectory(input?: string): string {
  if (!input) {
    return process.cwd();
  }

  if (input === "~") {
    return os.homedir();
  }

  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }

  return path.resolve(input);
}

function parseIngestArgs(args: string[]): IngestCliArgs {
  let directory: string | undefined;
  let collection = ragConfig.collectionName;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--collection") {
      collection = args[i + 1] ?? collection;
      i++;
      continue;
    }

    if (arg.startsWith("--collection=")) {
      collection = arg.slice("--collection=".length);
      continue;
    }

    if (!directory) {
      directory = arg;
    }
  }

  return { directory, collection };
}

const [, , command, ...args] = process.argv;

if (command === "ingest") {
  const { directory, collection } = parseIngestArgs(args);
  const targetDirectory = resolveDirectory(directory);

  try {
    console.log(`Indexing documents in: ${targetDirectory}`);
    console.log(`Collection: ${collection}`);
    await ingestDirectory(targetDirectory, { collection });
    process.exit(0);
  } catch (error) {
    console.error(
      "Ingestion failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

render(React.createElement(App));
