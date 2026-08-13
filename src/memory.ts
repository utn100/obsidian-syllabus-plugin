// memory.json schema and helpers

export interface TopicEntry {
  confidence: number;
  last_reviewed: string | null;
  last_applied: string | null;
  note_path: string;
  note_status: "stub" | "draft" | "enriched";
  so_what_filled: boolean;
  connection_count: number;
  connection_quality: string[];
  prerequisites: string[];
  related: string[];
}

export interface Memory {
  topics: Record<string, TopicEntry>;
  streaks: Record<string, { current: number; last_completed: string; longest: number }>;
  note_activity: {
    drafts_generated: number;
    so_what_sections_filled: number;
    captures_triggered: number;
    captures_completed: number;
  };
  bridge_stats: {
    total_fired: number;
    high_quality: number;
    generic: number;
    skipped_threshold: number;
  };
  knowledge_graph: {
    work_knowledge_graph: Record<string, string[]>;
    concept_application_count: Record<string, number>;
  };
  sessions: Array<{ date: string; completed: string[]; skipped: string[] }>;
  plan_version: string;
  last_updated: string;
}

export function emptyMemory(): Memory {
  return {
    topics: {},
    streaks: {},
    note_activity: {
      drafts_generated: 0,
      so_what_sections_filled: 0,
      captures_triggered: 0,
      captures_completed: 0,
    },
    bridge_stats: {
      total_fired: 0,
      high_quality: 0,
      generic: 0,
      skipped_threshold: 0,
    },
    knowledge_graph: {
      work_knowledge_graph: {},
      concept_application_count: {},
    },
    sessions: [],
    plan_version: "1.0",
    last_updated: new Date().toISOString().slice(0, 10),
  };
}

export function emptyTopic(slug: string): TopicEntry {
  return {
    confidence: 0,
    last_reviewed: null,
    last_applied: null,
    note_path: `concepts/${slug}.md`,
    note_status: "stub",
    so_what_filled: false,
    connection_count: 0,
    connection_quality: [],
    prerequisites: [],
    related: [],
  };
}

// Calculate capacity % — fraction of topics with so_what_filled
export function calcCapacity(memory: Memory): number {
  const topics = Object.values(memory.topics);
  if (topics.length === 0) return 0;
  const filled = topics.filter((t) => t.so_what_filled).length;
  return Math.round((filled / topics.length) * 1000) / 10;
}

// Parse topic slugs from plan text (Topics by theme section)
export function extractTopicsFromPlan(planText: string): string[] {
  const topics: string[] = [];
  let inTopicsSection = false;

  for (const line of planText.split("\n")) {
    if (line.includes("## Topics by theme")) {
      inTopicsSection = true;
      continue;
    }
    if (inTopicsSection && line.startsWith("## ")) {
      inTopicsSection = false;
      continue;
    }
    if (!inTopicsSection) continue;

    // Match: - **1.1. Topic name** — prerequisites: ...
    const m = line.match(/\*\*[\d.]+\s+([^*]+)\*\*/);
    if (m) {
      const slug = m[1]
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      if (slug) topics.push(slug);
    }
  }

  // Filter out Chinese/language topics (theme 4.x)
  return topics;
}

// Strip ```markdown ... ``` code fences LLM sometimes wraps output in
export function stripCodeFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:markdown)?\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();
}
