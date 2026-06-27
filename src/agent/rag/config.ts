import path from "node:path";

export const ragConfig = {
  collectionName: process.env.CHROMA_COLLECTION || "knowledge",

  chunkSize: Number(process.env.CHUNK_SIZE) || 1000,
  chunkOverlap: Number(process.env.CHUNK_OVERLAP) || 200,

  // Top-k retrieval count
  topK: Number(process.env.TOP_K) || 5,

  supportedExtensions: [".pdf", ".txt", ".md"],
  ignoreDirectories: ["node_modules", ".git", "dist"],

  chromaPersistDirectory:
    process.env.CHROMA_PERSIST_DIR ||
    path.join(process.cwd(), ".rag", "chroma"),

  embeddingModel: process.env.GOOGLE_EMBEDDING_MODEL || "gemini-embedding-001",

  ragDirectory: path.join(process.cwd(), ".rag"),
  hashesPath: path.join(process.cwd(), ".rag", "hashes.json"),
};
