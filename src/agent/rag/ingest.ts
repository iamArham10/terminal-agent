import path from "node:path";
import type { Collection, Metadata } from "chromadb";
import { chunkDocument } from "./chunk.js";
import { getCollection } from "./collection.js";
import { ragConfig } from "./config.js";
import { embedMany } from "./embed.js";
import {
  filePathFromHashStoreKey,
  hasFileChanged,
  hashFile,
  hashKeyBelongsToCollection,
  loadHashes,
  saveHashes,
  updateFileHash,
} from "./hash.js";
import { createChunkIds } from "./ids.js";
import { createChunkMetadatas } from "./metadata.js";
import { parseFile } from "./parser.js";
import { scanDirectory } from "./scanner.js";
import type { IngestOption } from "./types.js";

async function deleteFileChunks(
  collection: Collection,
  filePath: string,
): Promise<void> {
  await collection.delete({ where: { file: filePath } });
}

async function removeDeletedFiles(
  currentFiles: string[],
  collectionName: string,
): Promise<void> {
  const hashes = await loadHashes();
  const currentSet = new Set(currentFiles);
  const collection = await getCollection(collectionName);

  for (const key of Object.keys(hashes)) {
    if (!hashKeyBelongsToCollection(key, collectionName)) {
      continue;
    }

    const filePath = filePathFromHashStoreKey(key);

    if (!currentSet.has(filePath)) {
      await deleteFileChunks(collection, filePath);
      delete hashes[key];
      console.log(`Removed deleted file: ${filePath}`);
    }
  }

  await saveHashes(hashes);
}

async function ingestFile(
  filePath: string,
  baseDirectory: string,
  collectionName: string,
): Promise<void> {
  const changed = await hasFileChanged(filePath, collectionName);

  if (!changed) {
    console.log(`Skipping unchanged: ${filePath}`);
    return;
  }

  const hash = await hashFile(filePath);
  const document = await parseFile(filePath);
  const chunks = await chunkDocument(document);
  const collection = await getCollection(collectionName);

  await deleteFileChunks(collection, filePath);

  if (chunks.length === 0) {
    await updateFileHash(filePath, hash, collectionName);
    console.log(`Removed old chunks for empty file: ${filePath}`);
    return;
  }

  const ids = createChunkIds(filePath, chunks, baseDirectory);
  const metadatas = createChunkMetadatas(document, chunks, hash);
  const embeddings = await embedMany(chunks.map((chunk) => chunk.chunk));

  await collection.add({
    ids,
    documents: chunks.map((chunk) => chunk.chunk),
    embeddings,
    metadatas: metadatas as Metadata[],
  });

  await updateFileHash(filePath, hash, collectionName);
  console.log(`Indexed ${chunks.length} chunks: ${filePath}`);
}

export async function ingestDirectory(
  directory = process.cwd(),
  options: IngestOption = {},
): Promise<void> {
  const rootDirectory = path.resolve(directory);
  const collectionName = options.collection ?? ragConfig.collectionName;
  const files = await scanDirectory(rootDirectory);

  console.log(`Found ${files.length} files in ${rootDirectory}`);
  console.log(`Collection: ${collectionName}`);

  await removeDeletedFiles(files, collectionName);

  for (const file of files) {
    try {
      await ingestFile(file, rootDirectory, collectionName);
    } catch (error) {
      console.error(
        `Failed to index ${file}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("Ingestion complete.");
}
