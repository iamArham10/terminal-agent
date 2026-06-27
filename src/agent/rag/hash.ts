import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { ragConfig } from "./config.js";
import type { HashStore } from "./types.js";

const HASH_KEY_SEPARATOR = "::";

export function createHashStoreKey(
    filePath: string,
    collectionName = ragConfig.collectionName,
): string {
    return `${collectionName}${HASH_KEY_SEPARATOR}${filePath}`;
}

export function hashKeyBelongsToCollection(
    key: string,
    collectionName = ragConfig.collectionName,
): boolean {
    return key.startsWith(`${collectionName}${HASH_KEY_SEPARATOR}`);
}

export function filePathFromHashStoreKey(key: string): string {
    return key.slice(
        key.indexOf(HASH_KEY_SEPARATOR) + HASH_KEY_SEPARATOR.length,
    );
}

export async function hashFile(filePath: string): Promise<string> {
    const buffer = await fs.readFile(filePath);

    return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function ensureHashDirectory(): Promise<void> {
    await fs.mkdir(path.dirname(ragConfig.hashesPath), { recursive: true });
}

export async function loadHashes(): Promise<HashStore> {
    try {
        const content = await fs.readFile(ragConfig.hashesPath, "utf8");
        return JSON.parse(content) as HashStore;
    } catch (error) {
        if (
            error instanceof Error &&
            "code" in error &&
            error.code == "ENOENT"
        ) {
            return {};
        }

        throw error;
    }
}

export async function saveHashes(hashes: HashStore): Promise<void> {
    await ensureHashDirectory();

    await fs.writeFile(
        ragConfig.hashesPath,
        JSON.stringify(hashes, null, 2),
        "utf8",
    );
}

export async function hasFileChanged(
    filePath: string,
    collectionName = ragConfig.collectionName,
): Promise<boolean> {
    const hashes = await loadHashes();
    const currentHash = await hashFile(filePath);
    const key = createHashStoreKey(filePath, collectionName);
    const storedHash = hashes[key]?.hash;

    return storedHash !== currentHash;
}

export async function updateFileHash(
    filePath: string,
    hash?: string,
    collectionName = ragConfig.collectionName,
): Promise<void> {
    const hashes = await loadHashes();
    const key = createHashStoreKey(filePath, collectionName);
    hashes[key] = {
        hash: hash ?? (await hashFile(filePath)),
        lastIndexed: Math.floor(Date.now() / 1000),
    };

    await saveHashes(hashes);
}

export async function removeFileHash(
    filePath: string,
    collectionName = ragConfig.collectionName,
): Promise<void> {
    const hashes = await loadHashes();

    const key = createHashStoreKey(filePath, collectionName);
    delete hashes[key];

    await saveHashes(hashes);
}
