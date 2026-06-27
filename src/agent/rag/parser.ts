import fs from "node:fs/promises";
import path from "node:path";
import type { ParsedDocument } from "./types.js";
import { PDFParse } from "pdf-parse";
export async function parseFile(filePath: string): Promise<ParsedDocument> {
  const extension = path.extname(filePath).toLowerCase();

  let text: string;

  switch (extension) {
    case ".md":
    case ".txt": {
      text = await fs.readFile(filePath, "utf8");
      break;
    }

    case ".pdf": {
      const buffer = await fs.readFile(filePath);
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text;
      await parser.destroy();
      break;
    }

    default: {
      throw new Error(`Unsupported file extension: ${extension}`);
    }
  }

  return {
    path: filePath,
    extension,
    text,
  };
}
