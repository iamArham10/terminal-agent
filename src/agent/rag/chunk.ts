import { ragConfig } from "./config.js";
import type { DocumentChunk, ParsedDocument } from "./types.js";

type Span = { start: number; end: number };
type ChunkOptions = { chunkSize?: number; chunkOverlap?: number };

// Carry original spans through recursive splitting/overlap: searching for emitted
// text afterward cannot reliably locate repeated passages in the source.
function splitSpans(text: string, size: number, overlap: number): Span[] {
    const output: Span[] = [];
    const emit = (span: Span) => {
        const raw = text.slice(span.start, span.end);
        const trimmed = raw.trim();
        if (trimmed) {
            const start = span.start + raw.length - raw.trimStart().length;
            output.push({ start, end: start + trimmed.length });
        }
    };
    const merge = (pieces: Span[]) => {
        let pending: Span[] = [];
        for (const piece of pieces) {
            if (pending.length && piece.end - pending[0]!.start > size) {
                emit({
                    start: pending[0]!.start,
                    end: pending[pending.length - 1]!.end,
                });
                while (
                    pending.length &&
                    (pending[pending.length - 1]!.end - pending[0]!.start >
                        overlap ||
                        piece.end - pending[0]!.start > size)
                ) {
                    pending.shift();
                }
            }
            pending.push(piece);
        }
        if (pending.length) {
            emit({
                start: pending[0]!.start,
                end: pending[pending.length - 1]!.end,
            });
        }
    };
    const split = (span: Span, separators: string[]) => {
        const source = text.slice(span.start, span.end);
        const separatorIndex = separators.findIndex(
            (separator) => !separator || source.includes(separator),
        );
        const separator = separators[separatorIndex]!;
        const remaining = separators.slice(separatorIndex + 1);
        const pieces: Span[] = [];
        if (!separator) {
            for (let start = span.start; start < span.end; start++) {
                pieces.push({ start, end: start + 1 });
            }
        } else {
            let start = span.start;
            let boundary = text.indexOf(separator, span.start);
            while (boundary >= 0 && boundary + separator.length <= span.end) {
                if (boundary > start) pieces.push({ start, end: boundary });
                start = boundary;
                boundary = text.indexOf(separator, boundary + 1);
            }
            if (start < span.end) pieces.push({ start, end: span.end });
        }
        let small: Span[] = [];
        for (const piece of pieces) {
            if (piece.end - piece.start < size) {
                small.push(piece);
            } else {
                merge(small);
                small = [];
                if (remaining.length) split(piece, remaining);
                else emit(piece);
            }
        }
        merge(small);
    };
    split({ start: 0, end: text.length }, ["\n\n", "\n", " ", ""]);
    return output;
}

export async function chunkText(
    text: string,
    options: ChunkOptions = {},
): Promise<DocumentChunk[]> {
    const size = options.chunkSize ?? ragConfig.chunkSize;
    const overlap = options.chunkOverlap ?? ragConfig.chunkOverlap;
    if (
        !Number.isInteger(size) ||
        size < 1 ||
        !Number.isInteger(overlap) ||
        overlap < 0 ||
        overlap >= size
    ) {
        throw new Error(
            "Chunk size must be a positive integer and overlap must be between zero and size - 1",
        );
    }
    if (!text.trim()) return [];
    const spans = splitSpans(text, size, overlap);
    const lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\n" || (text[i] === "\r" && text[i + 1] !== "\n"))
            lineStarts.push(i + 1);
    }
    const lineAt = (offset: number) => {
        let low = 0;
        let high = lineStarts.length;
        while (low < high) {
            const middle = Math.floor((low + high) / 2);
            if (lineStarts[middle]! <= offset) low = middle + 1;
            else high = middle;
        }
        return low;
    };
    return spans.map((span, index) => ({
        chunk: text.slice(span.start, span.end),
        index,
        totalChunks: spans.length,
        lineStart: lineAt(span.start),
        lineEnd: lineAt(span.end - 1),
    }));
}

export async function chunkDocument(
    document: ParsedDocument,
    options: ChunkOptions = {},
): Promise<DocumentChunk[]> {
    if (document.extension !== ".pdf") return chunkText(document.text, options);
    if (!document.pages) {
        // Legacy callers may supply flattened PDF text; do not invent page or line numbers.
        return (await chunkText(document.text, options)).map(
            ({ lineStart, lineEnd, ...chunk }) => chunk,
        );
    }
    const chunks: DocumentChunk[] = [];
    for (const page of document.pages) {
        for (const { lineStart, lineEnd, ...chunk } of await chunkText(
            page.text,
            options,
        )) {
            chunks.push({ ...chunk, pageNumber: page.pageNumber });
        }
    }
    return chunks.map((chunk, index) => ({
        ...chunk,
        index,
        totalChunks: chunks.length,
    }));
}
