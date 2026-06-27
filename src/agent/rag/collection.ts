import { ChromaClient, type Collection } from "chromadb";
import { ragConfig } from "./config.js";

const client = new ChromaClient();

export function getChromaClient(): ChromaClient {
  return client;
}

export const getCollection = async (
  collectionName = ragConfig.collectionName,
): Promise<Collection> => {
  return client.getOrCreateCollection({
    name: collectionName,
    embeddingFunction: null,
    configuration: {
      hnsw: { space: "cosine" },
    },
  });
};
