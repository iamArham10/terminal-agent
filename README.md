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
Composer history is in-memory only (up to 100 entries). Conversations are saved
separately and can be restored using the session commands below.
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

- Node.js >= 20.12
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
OPENAI_MODEL=gpt-6-luna           # optional; this is the default

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

The agent and conversation summarizer use `gpt-6-luna` through OpenAI's Responses
API by default. Override it with `OPENAI_MODEL`. Luna's context window is 1,050,000
tokens, with up to 128,000 output tokens. Standard short-context pricing is $0.10
per million input tokens and $0.50 per million output tokens; reasoning tokens count
as output, and prompts over 272,000 input tokens have higher rates. See the
[official model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna).
Laminar tracing is initialized only when `LMNR_API_KEY` is set.

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

## Saved and resumable sessions

```bash
agi sessions                 # defaults to listing saved sessions
agi sessions list
agi --resume                 # shorthand for the most recently saved valid session
agi --resume latest          # explicit latest, across projects
agi --resume <id>            # full UUID from the listing
agi --help

# The source entrypoint supports the same arguments:
npm start -- sessions list
npm start -- --resume
```

Running `agi` without arguments starts a **new** session. Its UUID appears in the
UI. Sessions are automatically saved after each completed turn, before input is
enabled again; empty sessions are not saved. The first message supplies the title.
The listing shows IDs, titles, creation/update timestamps (UTC), and absolute
project directories, newest first.

Bare `--resume` is equivalent to `--resume latest`; an explicit full UUID selects
that session instead. An empty `--resume=` remains an error.

Resume restores the rendered user/assistant transcript, token usage, and model
context, including completed tool calls and their results. It switches to the
session's original project directory, rebuilds the current system prompt, and
**waits for new input**. Stored tool calls are never replayed. If the project was
moved or deleted, resume fails with an error rather than running tools elsewhere.
Both entrypoints optionally load `.env` from the project working directory;
listing and help need neither `.env` nor API keys and do not initialize providers.
Existing environment variables take precedence over `.env`.

### Storage and recovery

Sessions are local versioned JSON files in:

- `$XDG_STATE_HOME/terminal-agent/sessions` when `XDG_STATE_HOME` is absolute;
- otherwise `~/.local/state/terminal-agent/sessions`.

Storage uses directory mode `0700`, file mode `0600`, UUID-only filenames,
validation of message/tool-call pairs, and same-directory atomic replacement of
synced temporary files. Session files and the session directory cannot be
symlinks. Malformed, oversized, unsupported, or incomplete-tool sessions are
skipped with warnings when listing or selecting `latest`; explicitly resuming
one fails with an actionable error. Files are never silently repaired or
replaced. Listing an empty store does not create it.

Save failures are **nonfatal**: the UI warns that the session was not saved and
keeps the conversation in memory. Writes are queued and revision checked; a
per-session lock prevents concurrent processes from overwriting one another.
A stale process cannot overwrite a newer checkpoint. Resume again to continue
from the latest saved version after a conflict (unsaved in-memory work is not
merged). If a process dies during a save, a `.json.lock` file may remain. Its
contents are the writer PID: only remove that lock after confirming that no
other process is saving the session. Leftover hidden `.tmp` files are ignored.

### Limitations and privacy

- Local tools execute only through the explicit dispatcher after approval and
  successful stream completion. Any denial cancels the entire local batch,
  including earlier-approved calls; each call receives a cancellation result
  and the assistant confirms cancellation. Stored calls are never replayed.
- Stream errors, failed result promises, and non-completion finish reasons reject
  the turn instead of saving partial model history. Already-completed tool side
  effects from earlier batches cannot be rolled back if a later stream fails.
  Pending approvals and interrupted turns are not checkpoints.
- Provider-defined tools keep their provider configuration. Provider-executed
  remote tools are not gated by local approval or manually re-executed; callbacks
  explicitly label their results as provider-executed. Current bundled tools are
  local tools and require approval.
- Model context retains the existing compaction behavior; old tool context may
  be summarized when it grows too large. The rendered transcript remains intact.
- The current text-chat format is supported, including JSON tool inputs/results
  and provider metadata. Binary attachment persistence is not supported. Each
  session is limited to 64 MiB; listing reads session files in full.
- Files are **not encrypted** and may contain prompts, model reasoning, file
  contents, shell output, or secrets. Restrictive permissions are not protection
  against other processes running as your user. Keep backups and the configured
  state directory private. You can delete a session's JSON file while it is not
  in use; there is no retention, deletion, branching, or merge command yet.
- Resuming itself makes no model request. A subsequent chat turn sends restored
  model context to the configured model provider, just like an ordinary turn.

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

Offline session and CLI tests (no API keys, model requests, or Chroma required):

```bash
npm run test:sessions
```

These use Node's test runner through the existing `tsx` dependency and temporary
state directories, covering roundtrips, listing/latest, corrupt sessions,
validation and traversal prevention, permissions/symlinks, concurrent saves,
tool non-replay on load, argument parsing, and both entrypoints. Three concise
runner regressions use the actual AI SDK `MockLanguageModelV2` to cover approval,
batch cancellation, history save/resume, and rejection before checkpointing.

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
