import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { chunkDocument, chunkText } from "../src/agent/rag/chunk.js";
import {
    createCitation,
    formatSearchResults,
    mapRetrievalResults,
} from "../src/agent/rag/citations.js";
import { createChunkIds } from "../src/agent/rag/ids.js";
import { createChunkMetadatas } from "../src/agent/rag/metadata.js";
import { parseFile } from "../src/agent/rag/parser.js";
import type { ChunkMetadata } from "../src/agent/rag/types.js";
import { ragSourceDisplay } from "../src/ui/ragSources.js";

function retrieve(
    metadatas: ChunkMetadata[],
    documents: string[],
    ids?: string[],
) {
    return mapRetrievalResults(
        {
            ids: ids ? [ids] : undefined,
            distances: [metadatas.map(() => 0.2)],
            documents: [documents],
            metadatas: [metadatas],
        },
        "offline",
    );
}

// Real PDF objects/xref exercise pdf-parse without fixtures or dependencies.
function minimalPdf(): Buffer {
    const pages = ["First page evidence", "", "Third page evidence"];
    const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
    const objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        `<< /Type /Pages /Kids [${kids}] /Count 3 >>`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    for (const [i, text] of pages.entries()) {
        const stream = text ? `BT /F1 12 Tf 40 100 Td (${text}) Tj ET\n` : "";
        objects.push(
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
            `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
        );
    }
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    for (const [i, object] of objects.entries()) {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    }
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    pdf += offsets
        .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
        .join("");
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(pdf);
}

test("repeated text keeps original line attribution across overlapping chunks", async () => {
    const text = "\r\n  same\r\n" + "same\r\n".repeat(12) + "tail\r\n";
    const chunks = await chunkText(text, { chunkSize: 18, chunkOverlap: 6 });
    const lines = text.split("\r\n");
    assert.ok(chunks.length > 2);
    assert.equal(chunks[0]!.lineStart, 2);
    let previousLine = 0;
    for (const chunk of chunks) {
        assert.ok(chunk.lineStart! > previousLine);
        const source = lines.slice(chunk.lineStart! - 1, chunk.lineEnd!);
        assert.equal(source.join("\r\n").trim(), chunk.chunk);
        assert.equal(chunk.totalChunks, chunks.length);
        previousLine = chunk.lineStart!;
    }
    const document = { path: "/notes/repeated.md", extension: ".md", text };
    const metadata = createChunkMetadatas(document, chunks, "hash", "/notes");
    const results = retrieve(
        metadata,
        chunks.map((chunk) => chunk.chunk),
    );
    for (const [i, result] of results.entries()) {
        assert.equal(result.citation.lineStart, chunks[i]!.lineStart);
        assert.equal(result.citation.lineEnd, chunks[i]!.lineEnd);
    }
});

test("real PDF retains blank physical pages through chunking and citations", async () => {
    const parent = path.dirname(fileURLToPath(import.meta.url));
    const directory = await mkdtemp(path.join(parent, ".tmp-rag-"));
    try {
        const pdfPath = path.join(directory, "pages.pdf");
        await writeFile(pdfPath, minimalPdf());
        const document = await parseFile(pdfPath);
        assert.deepEqual(
            document.pages!.map((p) => p.pageNumber),
            [1, 2, 3],
        );
        assert.equal(document.pages![1]!.text.trim(), "");
        assert.match(document.pages![0]!.text, /First page evidence/);
        assert.match(document.pages![2]!.text, /Third page evidence/);

        const chunks = await chunkDocument(document, {
            chunkSize: 12,
            chunkOverlap: 3,
        });
        const pageNumbers = chunks.map((chunk) => chunk.pageNumber);
        assert.deepEqual([...new Set(pageNumbers)], [1, 3]);
        for (const page of [1, 3]) {
            assert.ok(pageNumbers.filter((n) => n === page).length > 1);
        }
        const metadata = createChunkMetadatas(
            document,
            chunks,
            "hash",
            directory,
        );
        const ids = createChunkIds(pdfPath, chunks, directory);
        const results = retrieve(
            metadata,
            chunks.map((c) => c.chunk),
            ids,
        );
        assert.equal(results.length, chunks.length);
        const display = ragSourceDisplay(formatSearchResults(results))!;
        for (const [i, result] of results.entries()) {
            const chunk = chunks[i]!;
            const sourcePage = document.pages![chunk.pageNumber! - 1]!;
            assert.ok(sourcePage.text.includes(chunk.chunk));
            assert.equal(chunk.index, i);
            assert.equal(chunk.totalChunks, chunks.length);
            assert.equal(result.metadata.pageNumber, sourcePage.pageNumber);
            assert.equal(result.citation.pageNumber, sourcePage.pageNumber);
            assert.equal(result.citation.filename, "pages.pdf");
            assert.equal(result.citation.chunkId, `pages.pdf#${i}`);
            assert.equal(
                result.citation.label,
                `[${pdfPath}, p. ${sourcePage.pageNumber}, chunk ${i + 1}/${chunks.length}]`,
            );
            assert.ok(!("lineStart" in result.citation));
            assert.ok(!("lineEnd" in result.citation));
            assert.ok(display.includes(result.citation.label));
        }
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("legacy metadata yields structured citations without guessed locations", () => {
    const metadata = {
        file: "/notes/guide.md",
        extension: ".md",
        type: "markdown",
        chunk: 1,
        totalChunks: 4,
        hash: "hash",
    };
    const results = retrieve([metadata], ["evidence"], ["guide.md#1"]);
    assert.equal(results.length, 1);
    const result = results[0]!;
    assert.deepEqual(result.metadata, metadata);
    assert.equal(result.content, "evidence");
    assert.equal(result.score, 0.8);
    assert.equal(result.citation.filename, "guide.md");
    assert.equal(result.citation.chunkId, "guide.md#1");
    assert.equal(result.citation.collection, "offline");
    assert.equal(result.citation.label, "[/notes/guide.md, chunk 2/4]");
    assert.ok(!("pageNumber" in result.citation));
    assert.ok(!("lineStart" in result.citation));
    assert.equal(createCitation(metadata)!.chunkId, "/notes/guide.md#1");
    const output = formatSearchResults(results);
    assert.deepEqual(JSON.parse(output).results[0].citation, result.citation);
    assert.ok(ragSourceDisplay(output)!.includes(result.citation.label));
});
