import { google } from "@ai-sdk/google";
import { ragConfig } from "./config.js";

const embeddingModel = google.embedding(ragConfig.embeddingModel);

export const embed = async (text: string): Promise<number[]> => {
    if (!text.trim()) {
        throw new Error("Cannot embed empty text");
    }

    const result = await embeddingModel.doEmbed({
        values: [text],
    });

    return result.embeddings[0];
};

export const embedMany = async (texts: string[]): Promise<number[][]> => {
    if (texts.length === 0) {
        return [];
    }

    if (texts.some((text) => !text.trim())) {
        throw new Error("Cannot embed empty text");
    }

    const result = await embeddingModel.doEmbed({
        values: texts,
    });

    return result.embeddings;
};
