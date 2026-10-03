export type DocumentPage = {
  pageNumber: number;
  text: string;
};

export type SourceLocation = {
  lineStart?: number;
  lineEnd?: number;
  pageNumber?: number;
};

export type ParsedDocument = {
  path: string;
  extension: string;
  text: string;
  pages?: DocumentPage[];
};

export type DocumentChunk = SourceLocation & {
  chunk: string;
  index: number;
  totalChunks: number;
};

export type FileHashRecord = {
  hash: string;
  lastIndexed: number;
};

export type HashStore = Record<string, FileHashRecord>;

export type ChunkMetadata = SourceLocation & {
  filename?: string;
  chunkId?: string;
  file: string;
  extension: string;
  type: string;
  chunk: number;
  totalChunks: number;
  hash: string;
};

export type SearchOptions = {
  query: string;
  collection?: string;
  topK?: number;
  file?: string;
  extension?: string;
  type?: string;
};

export type SourceCitation = SourceLocation & {
  file: string;
  filename: string;
  collection?: string;
  chunkId?: string;
  // Chunk indices remain zero-based, matching existing Chroma metadata.
  chunk?: number;
  totalChunks?: number;
  label: string;
};

export type SearchResult = {
  file: string;
  score: number;
  content: string;
  metadata: ChunkMetadata;
  citation: SourceCitation;
};

export type IngestOption = {
  collection?: string;
};
