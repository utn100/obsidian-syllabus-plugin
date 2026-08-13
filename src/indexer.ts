// Indexer — indexes concept notes into the vector index
// Handles: full re-index, incremental update, search

import { App, Notice, TFile } from "obsidian";
import {
  LocalEmbeddingClient,
  OpenAIEmbeddingClient,
  type EmbeddingClient,
} from "./embeddings";
import { VectorIndex, type SearchResult } from "./vector-index";
import type { MeridianSettings } from "./settings";

// Max characters of note content to embed (balance quality vs speed)
const MAX_EMBED_CHARS = 2000;

export class Indexer {
  private embedder: EmbeddingClient;
  public index: VectorIndex;

  constructor(
    private app: App,
    private settings: MeridianSettings
  ) {
    this.embedder = makeEmbeddingClient(settings);
    this.index = new VectorIndex(app, settings.meridianFolder);
  }

  async init(): Promise<void> {
    await this.index.load();
  }

  // Index all concept notes — batched for performance (P2)
  async indexAll(onProgress?: (done: number, total: number) => void): Promise<void> {
    const files = this.getConceptFiles();
    if (files.length === 0) return;

    const BATCH_SIZE = 50;
    let done = 0;

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const texts: string[] = [];

      for (const file of batch) {
        try {
          const content = await this.app.vault.read(file);
          texts.push(extractTextForEmbedding(content, MAX_EMBED_CHARS));
        } catch {
          texts.push("");
        }
      }

      try {
        const vectors = await this.embedder.embedBatch(texts);
        for (let j = 0; j < batch.length; j++) {
          if (vectors[j]?.length) {
            this.index.upsert({
              path: batch[j].path,
              stem: batch[j].basename,
              vector: vectors[j],
              updatedAt: new Date().toISOString(),
            });
          }
          done++;
          onProgress?.(done, files.length);
        }
      } catch (e) {
        // Fall back to serial on batch failure
        for (const file of batch) {
          try { await this.indexFile(file); } catch { /* skip */ }
          done++;
          onProgress?.(done, files.length);
        }
      }
    }

    try {
      await this.index.save();
    } catch (e) {
      console.error(`[Syllabus] failed to save index:`, e);
    }
  }

  // Incrementally index a single file — called on note save/create
  async indexFile(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const text = extractTextForEmbedding(content, MAX_EMBED_CHARS);
    const vector = await this.embedder.embed(text);
    this.index.upsert({
      path: file.path,
      stem: file.basename,
      vector,
      updatedAt: new Date().toISOString(),
    });
  }

  // Remove a file from the index
  removeFile(path: string): void {
    this.index.remove(path);
  }

  // Search concept notes by semantic similarity to a query string
  async search(
    query: string,
    maxResults = 5,
    threshold = 0.30
  ): Promise<SearchResult[]> {
    const vector = await this.embedder.embed(query);
    return this.index.search(vector, maxResults, threshold);
  }

  private getConceptFiles(): TFile[] {
    const conceptsPath = `${this.settings.meridianFolder}/concepts`;
    return this.app.vault.getMarkdownFiles().filter(
      (f) => f.path.startsWith(conceptsPath + "/")
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeEmbeddingClient(settings: MeridianSettings): EmbeddingClient {
  // Use dedicated openaiEmbeddingKey if set, otherwise fall back to main apiKey
  const embeddingKey = settings.openaiEmbeddingKey || settings.apiKey;

  if (settings.embeddingBackend === "local") {
    if (embeddingKey) return new OpenAIEmbeddingClient(embeddingKey);
    return new LocalEmbeddingClient();
  }
  return new OpenAIEmbeddingClient(embeddingKey);
}

function extractTextForEmbedding(content: string, maxChars: number): string {
  // Strip YAML frontmatter
  const withoutFrontmatter = content.replace(/^---[\s\S]*?---\n/, "");
  // Strip markdown syntax (headers, links, bold, etc.)
  const plain = withoutFrontmatter
    .replace(/#+\s/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .trim();
  return plain.slice(0, maxChars);
}
