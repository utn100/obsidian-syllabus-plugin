// Work-learning bridge — fires when a work note is saved
// Mirrors Python agent/graph/reactive_graph.py logic

import { App, TFile } from "obsidian";
import type MeridianPlugin from "./main";
import type { Memory } from "./memory";
import { Toast } from "./toast";
import { CaptureModal } from "./capture-modal";
import { SYSTEM_PROMPT } from "./prompts";

const SIMILARITY_THRESHOLD = 0.40;
const MAX_EMBED_CHARS = 2000;

export interface BridgeResult {
  fired: boolean;
  concept: string;
  quality: "high" | "generic" | "skipped";
  connection: string;
}

// ── Debounce registry ──────────────────────────────────────────────────────
// One timer per file path — resets on each save, fires 30s after last save

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleBridge(
  app: App,
  plugin: MeridianPlugin,
  filePath: string,
  debounceMs = 30000
): void {
  const existing = debounceTimers.get(filePath);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => {
    debounceTimers.delete(filePath);
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      await runBridge(app, plugin, file);
    }
  }, debounceMs);

  debounceTimers.set(filePath, timer);
}

export function cancelBridge(filePath: string): void {
  const existing = debounceTimers.get(filePath);
  if (existing) {
    clearTimeout(existing);
    debounceTimers.delete(filePath);
  }
}

// ── Main bridge logic ──────────────────────────────────────────────────────

export async function runBridge(
  app: App,
  plugin: MeridianPlugin,
  file: TFile
): Promise<BridgeResult> {
  const memory = await plugin.loadMemory();
  if (!memory) return { fired: false, concept: "", quality: "skipped", connection: "" };

  // Read work note content
  const content = await app.vault.read(file);
  const text = content.slice(0, MAX_EMBED_CHARS);

  // Semantic search — find most relevant concept note
  let hits;
  try {
    hits = await plugin.indexer.search(text, 3, SIMILARITY_THRESHOLD);
  } catch {
    return { fired: false, concept: "", quality: "skipped", connection: "" };
  }

  if (hits.length === 0) {
    return { fired: false, concept: "", quality: "skipped", connection: "" };
  }

  const topHit = hits[0];
  const conceptStem = topHit.stem;
  const topicEntry = memory.topics[conceptStem];

  // Load concept note content for context
  const conceptPath = `${plugin.settings.meridianFolder}/concepts/${conceptStem}.md`;
  const conceptFile = app.vault.getAbstractFileByPath(conceptPath);
  let conceptContent = "";
  if (conceptFile instanceof TFile) {
    conceptContent = await app.vault.read(conceptFile);
  }

  // Expand 1-hop neighborhood via related: frontmatter
  const neighbors = extractRelated(conceptContent).slice(0, 3);
  const neighborContext = await loadNeighborContext(app, plugin, neighbors);

  // Determine connection quality
  const soWhatFilled = topicEntry?.so_what_filled ?? false;

  // Generate connection via LLM
  const connection = await generateConnection(
    plugin,
    file.basename,
    content.slice(0, 1000),
    conceptStem,
    conceptContent,
    neighborContext,
    soWhatFilled,
    plugin.userRole
  );

  if (!connection) {
    return { fired: false, concept: conceptStem, quality: "skipped", connection: "" };
  }

  const quality = soWhatFilled ? "high" : "generic";

  // Append connection to work note
  const connectionBlock = buildConnectionBlock(conceptStem, connection, soWhatFilled);
  const updatedContent = content.trimEnd() + "\n\n" + connectionBlock + "\n";
  await app.vault.modify(file, updatedContent);

  // Update memory
  await updateMemory(plugin, memory, conceptStem, file.basename, quality);

  // Show toast
  if (plugin.settings.connectionToasts) {
    showConnectionToast(app, plugin, conceptStem, connection, soWhatFilled);
  }

  return { fired: true, concept: conceptStem, quality, connection };
}

// ── LLM connection generation ──────────────────────────────────────────────

async function generateConnection(
  plugin: MeridianPlugin,
  workNoteTitle: string,
  workNoteExcerpt: string,
  conceptStem: string,
  conceptContent: string,
  neighborContext: string,
  soWhatFilled: boolean,
  userRole: string
): Promise<string | null> {
  const conceptReadable = conceptStem.replace(/-/g, " ");

  const soWhatSection = extractSection(conceptContent, `So what for ${userRole}`) ||
                        extractSection(conceptContent, "So what");

  const prompt = soWhatFilled
    ? `You are Syllabus, a learning agent connecting study material to work.

The user is a ${userRole} working on: "${workNoteTitle}"

Work note excerpt:
${workNoteExcerpt}

Concept studied: ${conceptReadable}
So what for ${userRole}: ${soWhatSection}
Related context: ${neighborContext || "none"}

Write a SPECIFIC 2-sentence connection explaining exactly how ${conceptReadable} applies to what they are writing right now. Reference the actual content of their work note. Be concrete and actionable.

Output only the 2 sentences, nothing else.`
    : `You are Syllabus, a learning agent connecting study material to work.

The user is a ${userRole} working on: "${workNoteTitle}"

Concept studied: ${conceptReadable}

Write a brief generic connection (2 sentences) noting that ${conceptReadable} is relevant to their work. Keep it general since the "So what" section hasn't been filled yet.

Output only the 2 sentences, nothing else.`;

  try {
    const response = await plugin.llmClient.complete(
      [{ role: "user", content: prompt }],
      SYSTEM_PROMPT,
      256
    );
    const text = response.text.trim();
    // Validate: must be at least 20 chars and mention the concept
    if (text.length < 20) return null;
    return text;
  } catch {
    return null;
  }
}

// ── Connection block ───────────────────────────────────────────────────────

function buildConnectionBlock(
  conceptStem: string,
  connection: string,
  soWhatFilled: boolean
): string {
  const today = new Date().toISOString().slice(0, 10);
  const quality = soWhatFilled ? "" : "\n> *Fill [[" + conceptStem + "]] → \"So what for [role]\" for a specific connection next time.*";
  return `---\n*Syllabus (${today})*: You studied [[${conceptStem}]].\n${connection}${quality}`;
}

// ── Toast ──────────────────────────────────────────────────────────────────

function showConnectionToast(
  app: App,
  plugin: MeridianPlugin,
  conceptStem: string,
  connection: string,
  soWhatFilled: boolean
): void {
  const shortConnection = connection.length > 100
    ? connection.slice(0, 97) + "..."
    : connection;

  Toast.show(
    app,
    `[[${conceptStem}]] — ${shortConnection}`,
    [
      {
        label: "View",
        onClick: () => {
          const path = `${plugin.settings.meridianFolder}/concepts/${conceptStem}.md`;
          const file = app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) {
            app.workspace.getLeaf(false).openFile(file);
          }
        },
      },
      {
        label: "Capture",
        onClick: () => new CaptureModal(app, plugin, conceptStem).open(),
      },
    ],
    8000
  );

  // If so_what not filled, show follow-up prompt after 10s
  if (!soWhatFilled) {
    setTimeout(() => {
      Toast.show(
        app,
        `Fill [[${conceptStem}]] → "So what for ${plugin.userRole}" for specific connections`,
        [
          {
            label: "Open note",
            onClick: () => new CaptureModal(app, plugin, conceptStem).open(),
          },
        ],
        10000
      );
    }, 10000);
  }
}

// ── Memory update ──────────────────────────────────────────────────────────

async function updateMemory(
  plugin: MeridianPlugin,
  memory: Memory,
  conceptStem: string,
  workNoteBasename: string,
  quality: "high" | "generic"
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Update topic entry
  if (memory.topics[conceptStem]) {
    memory.topics[conceptStem].last_applied = today;
    memory.topics[conceptStem].connection_count += 1;
    memory.topics[conceptStem].connection_quality.push(quality);
  }

  // Update bridge stats
  memory.bridge_stats.total_fired += 1;
  if (quality === "high") memory.bridge_stats.high_quality += 1;
  else memory.bridge_stats.generic += 1;

  // Update work-knowledge graph
  const wkg = memory.knowledge_graph.work_knowledge_graph;
  if (!wkg[workNoteBasename]) wkg[workNoteBasename] = [];
  if (!wkg[workNoteBasename].includes(conceptStem)) {
    wkg[workNoteBasename].push(conceptStem);
  }

  const cac = memory.knowledge_graph.concept_application_count;
  cac[conceptStem] = (cac[conceptStem] ?? 0) + 1;

  memory.last_updated = today;
  await plugin.saveMemory(memory);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractRelated(content: string): string[] {
  const m = content.match(/^related:\s*\[([^\]]*)\]/m);
  if (!m) return [];
  return m[1].split(",").map(s => s.trim()).filter(Boolean);
}

function extractSection(content: string, sectionName: string): string {
  const re = new RegExp(`## ${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const m = content.match(re);
  if (!m) return "";
  return m[1].trim().replace(/^\*←.*\*$/m, "").trim(); // strip placeholder
}

async function loadNeighborContext(
  app: App,
  plugin: MeridianPlugin,
  stems: string[]
): Promise<string> {
  const parts: string[] = [];
  for (const stem of stems) {
    const path = `${plugin.settings.meridianFolder}/concepts/${stem}.md`;
    const file = app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const content = await app.vault.read(file);
      const whatSection = extractSection(content, "What it is");
      if (whatSection) parts.push(`${stem}: ${whatSection.slice(0, 150)}`);
    }
  }
  return parts.join(" | ");
}
