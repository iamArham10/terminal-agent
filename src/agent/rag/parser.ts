import fs from "node:fs/promises";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import type { ParsedDocument } from "./types.js";

export function documentFromPdfPages(
  filePath: string,
  pages: ReadonlyArray<{ num: number; text: string }>,
): ParsedDocument {
  if (pages.some((page) => !Number.isInteger(page.num) || page.num < 1)) {
    throw new Error("PDF parser returned an invalid page number");
  }
  return {
    path: filePath,
    extension: ".pdf",
    text: pages.map((page) => page.text).join("\n\n"),
    pages: pages.map((page) => ({ pageNumber: page.num, text: page.text })),
  };
}

export async function parseFile(filePath: string): Promise<ParsedDocument> {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".md":
    case ".txt":
      return {
        path: filePath,
        extension,
        text: await fs.readFile(filePath, "utf8"),
      };
    case ".pdf": {
      const parser = new PDFParse({ data: await fs.readFile(filePath) });
      try {
        const result = await parser.getText({ pageJoiner: "" });
        return documentFromPdfPages(filePath, result.pages);
      } finally {
        await parser.destroy();
      }
    }
    default:
      throw new Error(`Unsupported file extension: ${extension}`);
  }
}
