export type ParsedDocument = {
  path: string;
  extension: string;
  text: string;
};

export type DocumentChunk = {
  chunk: string;
  index: number;
  totalChunks: number;
};

export type FileHashRecord = {
  hash: string;
  lastIndexed: number;
};

export type HashStore = Record<string, FileHashRecord>;

export type ChunkMetadata = {
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

export type SearchResult = {
  file: string;
  score: number;
  content: string;
  metadata: ChunkMetadata;
};

export type IngestOption = {
  collection?: string;
};
