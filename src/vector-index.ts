// Vector index — stores embeddings as JSON in the vault
// Path: meridian/.meridian/embeddings.json

import { App, TFile } from "obsidian";
import { cosineSimilarity } from "./embeddings";

export interface IndexEntry {
  path: string;       // vault-relative path, e.g. "meridian/concepts/rlhf.md"
  stem: string;       // filename without extension, e.g. "rlhf"
  vector: number[];   // embedding vector
  updatedAt: string;  // ISO timestamp of last index
}

export interface SearchResult {
  path: string;
  stem: string;
  score: number;
}

export class VectorIndex {
  private entries: Map<string, IndexEntry> = new Map();
  private indexPath: string;

  constructor(
    private app: App,
    private meridianFolder: string
  ) {
    this.indexPath = `${meridianFolder}/.meridian/embeddings.json`;
  }

  async load(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.indexPath);
    if (!file || !(file instanceof TFile)) {
      this.entries = new Map();
      return;
    }
    try {
      const raw = await this.app.vault.read(file);
      const arr: IndexEntry[] = JSON.parse(raw);
      this.entries = new Map(arr.map((e) => [e.path, e]));
    } catch {
      this.entries = new Map();
    }
  }

  async save(): Promise<void> {
    const arr = Array.from(this.entries.values());
    const content = JSON.stringify(arr, null, 2);
    const file = this.app.vault.getAbstractFileByPath(this.indexPath);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(this.indexPath, content);
    }
  }

  upsert(entry: IndexEntry): void {
    this.entries.set(entry.path, entry);
  }

  remove(path: string): void {
    this.entries.delete(path);
  }

  has(path: string): boolean {
    return this.entries.has(path);
  }

  getUpdatedAt(path: string): string | null {
    return this.entries.get(path)?.updatedAt ?? null;
  }

  size(): number {
    return this.entries.size;
  }

  search(queryVector: number[], maxResults = 5, threshold = 0.30): SearchResult[] {
    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      const score = cosineSimilarity(queryVector, entry.vector);
      if (score >= threshold) {
        results.push({ path: entry.path, stem: entry.stem, score });
      }
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
  }
}
