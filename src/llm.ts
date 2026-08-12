// LLM provider types and interfaces

export type LLMProvider = "anthropic" | "openai" | "ollama";

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMClient {
  complete(
    messages: LLMMessage[],
    systemPrompt?: string,
    maxTokens?: number,
    signal?: AbortSignal
  ): Promise<LLMResponse>;
}

// ── Anthropic ──────────────────────────────────────────────────────────────

export class AnthropicClient implements LLMClient {
  constructor(
    private apiKey: string,
    private model: string = "claude-sonnet-latest"
  ) {}

  async complete(
    messages: LLMMessage[],
    systemPrompt?: string,
    maxTokens = 8192,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: maxTokens,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (systemPrompt) body.system = systemPrompt;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return {
      text: data.content[0].text,
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    };
  }
}

// ── OpenAI ─────────────────────────────────────────────────────────────────

export class OpenAIClient implements LLMClient {
  constructor(
    private apiKey: string,
    private model: string = "gpt-4o"
  ) {}

  async complete(
    messages: LLMMessage[],
    systemPrompt?: string,
    maxTokens = 8192,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    const allMessages = systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: maxTokens,
        messages: allMessages,
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return {
      text: data.choices[0].message.content,
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
    };
  }
}

// ── Ollama ─────────────────────────────────────────────────────────────────

export class OllamaClient implements LLMClient {
  constructor(
    private baseUrl: string = "http://localhost:11434",
    private model: string = "llama3.2"
  ) {}

  async complete(
    messages: LLMMessage[],
    systemPrompt?: string,
    maxTokens = 8192,
    signal?: AbortSignal
  ): Promise<LLMResponse> {
    const allMessages = systemPrompt
      ? [{ role: "system" as const, content: systemPrompt }, ...messages]
      : messages;

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages: allMessages,
        stream: false,
        options: { num_predict: maxTokens },
      }),
      signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    return {
      text: data.message.content,
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
    };
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function makeLLMClient(settings: {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  ollamaUrl: string;
}): LLMClient {
  switch (settings.provider) {
    case "anthropic":
      return new AnthropicClient(settings.apiKey, settings.model);
    case "openai":
      return new OpenAIClient(settings.apiKey, settings.model);
    case "ollama":
      return new OllamaClient(settings.ollamaUrl, settings.model);
  }
}

export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-latest",
  openai: "gpt-4o",
  ollama: "llama3.2",
};

export async function testConnection(client: LLMClient): Promise<string | null> {
  try {
    const res = await client.complete(
      [{ role: "user", content: "Reply with exactly: ok" }],
      undefined,
      10
    );
    if (!res.text) return "Empty response from provider";
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
