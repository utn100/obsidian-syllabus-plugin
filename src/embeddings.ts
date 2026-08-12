// Embedding client — local (@xenova/transformers) and OpenAI API backends

export interface EmbeddingClient {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

// ── Local embeddings via @xenova/transformers ──────────────────────────────
// Note: @xenova/transformers v2 does not load reliably in Obsidian's Electron
// environment. Use OpenAI embedding backend in settings instead.

export class LocalEmbeddingClient implements EmbeddingClient {
  async embed(_text: string): Promise<number[]> {
    throw new Error(
      "Local embeddings are not supported in this version. " +
      "Switch to OpenAI embedding backend in Meridian settings."
    );
  }

  async embedBatch(_texts: string[]): Promise<number[][]> {
    throw new Error("Local embeddings not supported. Use OpenAI backend.");
  }
}

// ── OpenAI embedding API ───────────────────────────────────────────────────

export class OpenAIEmbeddingClient implements EmbeddingClient {
  constructor(
    private apiKey: string,
    private model: string = "text-embedding-3-small"
  ) {}

  async embed(text: string): Promise<number[]> {
    const [result] = await this.embedBatch([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI embeddings error ${res.status}: ${err}`);
      }

      const data = await res.json();
      return data.data
        .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
        .map((d: { embedding: number[] }) => d.embedding);
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ── Cosine similarity ──────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
