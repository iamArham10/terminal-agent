# Terminal Agent

A terminal-based AI agent with tool use, semantic document search (RAG), file management, shell execution, and web search.

## Terminal UI

The Ink interface uses a restrained cyan/neutral theme, a live Ready/Working/Approval
header, a resize-aware conversation viewport, and an always-visible context estimate.
Messages support lightweight Markdown: headings, bullets, quotes, **bold**, inline
code, fenced code blocks, and visible link targets. Code is wrapped, not executed;
terminal control sequences and directional overrides in displayed content are removed.
The welcome screen suggests prompts and explains tool permissions.

### Controls

| Action                                            | Keys                                   |
| ------------------------------------------------- | -------------------------------------- |
| Send message                                      | Enter                                  |
| Move / edit                                       | Left/Right, Home/End, Backspace/Delete |
| Start / end of line                               | Ctrl+A / Ctrl+E                        |
| Clear line / delete to end / delete previous word | Ctrl+U / Ctrl+K / Ctrl+W               |
| Previous / next prompt (preserves your draft)     | Up/Down or Ctrl+P / Ctrl+N             |
| Scroll conversation                               | PageUp / PageDown                      |
| Exit                                              | Ctrl+C, or send `exit` / `quit`        |

The composer is single-line with a horizontal cursor viewport. Pasted line breaks
become spaces; Enter is still required to send. Input pauses while the agent runs.
Prompt history is in-memory only (up to 100 entries); this UI does not add sessions.
The transcript follows new output unless you scroll back. Recent tool activity shows
arguments and a brief result/status; it is a summary, not a durable execution log.

### Tool approvals and context

Every existing approval callback remains in place. **Deny is selected by default**;
Enter confirms the selected choice, arrows/Tab switch between Deny and Allow once,
and Esc or `n` denies immediately. Full sanitized arguments are paged (not silently
truncated): use PageUp/PageDown or `[` / `]` to inspect them before allowing.
The approval panel temporarily replaces the transcript to keep permissions visible
in small terminals. Local tools execute once, only after approval; declining any
local tool cancels the entire batch. There is no “allow all” mode. Provider-executed
remote tools, if configured, cannot be gated by local approval.

Context is an **estimate** supplied by the existing agent, not billed usage. It shows
tokens versus model capacity and the existing compaction threshold. Colours warn as
the threshold approaches. Compaction behavior is unchanged; the shared runner
prevents SDK auto-execution of local tools and reports failed/truncated turns as errors.

Layout reflows on terminal resize; 12 columns × 10 rows is the minimum layout size.
Markdown is intentionally lightweight (no tables, syntax highlighting, or full
CommonMark parsing). Terminal Unicode cell widths can vary by font/emulator.

Offline validation (no API keys or services required):

```bash
npm run test:ui
npm run build
```

## What I added

I extended this terminal agent with a full RAG workflow and web search support:

- RAG search over local documents using ChromaDB
- Document ingestion for Markdown, TXT, and PDF files
- Google embeddings for semantic search
- Hash-based re-indexing so unchanged files are skipped
- Collection support for separate knowledge bases
- LLM-callable `ragSearch` tool
- Tavily-powered `webSearch` tool
- Shell command execution through `runCommand`
- Human-in-the-loop tool handling
- CLI ingestion flow with `agi ingest`

This makes the agent useful for searching local notes, PDFs, project docs, and web results from the same terminal chat interface.

## Project note

This project started as a fork of `Hendrixer/agents-v2`. My work focuses on adding RAG, Tavily web search, shell execution, document ingestion, and agent tooling improvements.

---

## Requirements

- Node.js >= 20
- A running Chroma server (for RAG)
- API keys (see [Environment variables](#environment-variables))

---

## Installation

```bash
npm install
npm run build
npm link          # makes `agi` available globally
```

Or run without installing globally:

```bash
npm run start
```

---

## Environment variables

Create a `.env` file in the project root:

```env
# Required for LLM (OpenAI)
OPENAI_API_KEY=your_openai_key

# Required for RAG embeddings (Google)
GOOGLE_GENERATIVE_AI_API_KEY=your_google_key

# Optional: Tavily web search
TAVILY_API_KEY=your_tavily_key

# Optional: Laminar tracing
LMNR_API_KEY=your_lmnr_key

# Optional RAG tuning
CHROMA_COLLECTION=knowledge       # default collection name
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
TOP_K=5
GOOGLE_EMBEDDING_MODEL=gemini-embedding-001
```

---

## Starting the Chroma server

Chroma is required for the RAG (`ragSearch`) tool to work.

```bash
# Start in the background (stores data to .rag/chroma)
npx chroma run --path .rag/chroma --host localhost --port 8000
```

Or add it to a startup script. Chroma runs on `http://localhost:8000` by default.

To verify it is running:

```bash
curl http://localhost:8000/api/v2/heartbeat
```

---

## Running the agent

```bash
agi
```

This opens the interactive chat UI. Type your message and press Enter.

To quit: type `exit` or `quit`.

---

## Ingesting documents for RAG

Index documents so the agent can search them with `ragSearch`.

### Index the current directory

```bash
agi ingest
```

### Index a specific directory

```bash
agi ingest ./notes
agi ingest ~/Documents
agi ingest /path/to/any/folder
```

### Index into a named collection

```bash
agi ingest ./notes --collection notes
agi ingest ./research --collection research
agi ingest ~/Documents --collection personal
```

Collections let you organize different knowledge bases and search them separately.

### Supported file types

| Extension | Type     |
| --------- | -------- |
| `.md`     | Markdown |
| `.txt`    | Text     |
| `.pdf`    | PDF      |

### How re-indexing works

- Unchanged files are **skipped** (hash-based).
- Modified files are **re-indexed** (old chunks deleted, new ones inserted).
- Deleted files have their chunks **removed** from Chroma automatically.

---

## Using RAG in the agent

Once documents are indexed, ask the agent naturally:

```
Who created the course?
What is this course about?
Summarize the notes on tool calling.
Search my notes for information about Docker networking.
```

The agent will call `ragSearch` automatically. You can also guide it:

```
Search the agent-notes collection for tool calling examples.
Look in my notes collection for JWT authentication.
```

---

## Available tools for agents

| Tool         | Description                                          |
| ------------ | ---------------------------------------------------- |
| `ragSearch`  | Semantic search over indexed local documents         |
| `readFile`   | Read the contents of a file                          |
| `writeFile`  | Write content to a file (creates parent directories) |
| `listFiles`  | List files and folders in a directory                |
| `deleteFile` | Delete a file (irreversible)                         |
| `webSearch`  | Search the web (powered by Tavily)                   |
| `runCommand` | Run a shell command                                  |

---

## RAG collection management

### List what is indexed

```bash
# Check how many chunks are in a collection
npx tsx --env-file=.env -e '
import { getCollection } from "./src/agent/rag/collection.ts";
const c = await getCollection("agent-notes");
console.log("chunks:", await c.count());
'
```

### Delete a collection (wipe all its data)

```bash
npx tsx --env-file=.env -e '
import { getChromaClient } from "./src/agent/rag/collection.ts";
const client = getChromaClient();
await client.deleteCollection({ name: "agent-notes" });
console.log("deleted");
'
```

### Delete the hash store (force full re-index next time)

```bash
rm .rag/hashes.json
```

### Wipe all Chroma data

```bash
rm -rf .rag/chroma
```

### Wipe everything RAG-related

```bash
rm -rf .rag
```

After wiping, re-ingest your documents:

```bash
agi ingest ./notes --collection notes
```

---

## Building

```bash
npm run build
```

Output goes to `./dist`.

---

## Development mode

```bash
npm run dev
```

Runs with `tsx` (no build step needed). Watches for file changes.

---

## Troubleshooting

### Chroma not connecting

Make sure Chroma is running:

```bash
npx chroma run --path .rag/chroma --port 8000
```

Check:

```bash
curl http://localhost:8000/api/v2/heartbeat
```

### RAG returns no results

1. Make sure you ingested documents first: `agi ingest ./your-docs --collection your-collection`
2. Tell the agent which collection to search: `"Search the notes collection for..."`
3. Check the collection has data:

```bash
npx tsx --env-file=.env -e '
import { getCollection } from "./src/agent/rag/collection.ts";
const c = await getCollection("your-collection");
console.log(await c.count());
'
```

### Embedding model errors

Make sure `GOOGLE_GENERATIVE_AI_API_KEY` is set and valid. The default embedding model is `gemini-embedding-001`.

### Force re-index a file

Delete its entry from `.rag/hashes.json` or delete the whole file:

```bash
rm .rag/hashes.json   # will re-index everything next ingest
```
