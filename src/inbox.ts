// Inbox processing — classifies dropped notes and converts to concept notes

import { App, TFile } from "obsidian";
import type MeridianPlugin from "./main";
import { Toast } from "./toast";
import { SYSTEM_PROMPT } from "./prompts";
import { stripCodeFence } from "./memory";

const INBOX_PROCESSED = "processed";

// ── Entry point called from vault.on('create') ─────────────────────────────

export async function processInboxFile(
  app: App,
  plugin: MeridianPlugin,
  file: TFile
): Promise<void> {
  // Show processing toast
  const processingToast = Toast.show(app, `Processing ${file.name}...`, [], 30000);

  try {
    const content = await app.vault.read(file);
    const base = plugin.settings.meridianFolder;

    // Step 1: classify
    const classification = await classifyContent(plugin, content);
    if (classification === "irrelevant") {
      processingToast.dismiss();
      await archiveFile(app, file, base);
      Toast.show(app, `${file.name} — not a study note, archived`, [], 5000);
      return;
    }

    // Step 2: extract concept name
    const conceptName = await extractConceptName(plugin, content);
    if (!conceptName) {
      processingToast.dismiss();
      Toast.show(app, `Could not extract concept from ${file.name}`, [], 5000);
      return;
    }

    const conceptStem = toSlug(conceptName);

    // Step 3: check if note already exists
    const existingPath = `${base}/concepts/${conceptStem}.md`;
    const existingFile = app.vault.getAbstractFileByPath(existingPath);
    const existingContent = existingFile instanceof TFile
      ? await app.vault.read(existingFile)
      : null;

    // Step 4: map content to note sections
    const noteText = await mapToNoteSections(
      plugin,
      content,
      conceptName,
      existingContent,
      plugin.userRole
    );

    if (!noteText) {
      processingToast.dismiss();
      Toast.show(app, `Failed to process ${file.name}`, [], 5000);
      return;
    }

    // Step 5: write concept note
    if (existingFile instanceof TFile) {
      await app.vault.modify(existingFile, noteText);
    } else {
      try {
        await app.vault.create(existingPath, noteText);
      } catch {
        const f = app.vault.getAbstractFileByPath(existingPath);
        if (f instanceof TFile) await app.vault.modify(f, noteText);
      }
    }

    // Step 6: update memory
    await updateMemoryForNewNote(plugin, conceptStem);

    // Step 7: archive inbox file
    await archiveFile(app, file, base);

    // Step 8: index the new note
    const newFile = app.vault.getAbstractFileByPath(existingPath);
    if (newFile instanceof TFile) {
      try { await plugin.indexer.indexFile(newFile); await plugin.indexer.index.save(); } catch { /* ok */ }
    }

    processingToast.dismiss();

    // Show success toast + so what prompt
    const action = existingContent ? "updated" : "created";
    Toast.show(
      app,
      `✓ ${action}: [[${conceptStem}]]`,
      [{
        label: "Open note",
        onClick: () => {
          const f = app.vault.getAbstractFileByPath(existingPath);
          if (f instanceof TFile) app.workspace.getLeaf(false).openFile(f);
        },
      }],
      5000
    );

    // So what prompt after 6s
    setTimeout(() => {
      Toast.show(
        app,
        `Take 30s — what does [[${conceptStem}]] mean for your work?`,
        [{
          label: "Fill it now",
          onClick: async () => {
            const { CaptureModal } = await import("./capture-modal");
            new CaptureModal(app, plugin, conceptStem).open();
          },
        }],
        10000
      );
    }, 6000);

  } catch (e) {
    processingToast.dismiss();
    Toast.show(app, `Error processing ${file.name}: ${(e as Error).message}`, [], 8000);
    console.error("[Syllabus] inbox error:", e);
  }
}

// ── LLM calls ──────────────────────────────────────────────────────────────

async function classifyContent(plugin: MeridianPlugin, content: string): Promise<string> {
  const excerpt = content.slice(0, 1500);
  const response = await plugin.llmClient.complete(
    [{
      role: "user",
      content: `Classify this content as one of: study_guide, raw_notes, structured_outline, irrelevant\n\nRules:\n- study_guide/raw_notes/structured_outline: any educational content with learnable concepts\n- irrelevant: ONLY if there is NO learnable concept (e.g. pure meeting notes, todo lists)\n\nContent:\n${excerpt}\n\nRespond with ONLY the classification word, nothing else.`,
    }],
    undefined,
    20
  );
  const cls = response.text.trim().toLowerCase();
  return ["study_guide", "raw_notes", "structured_outline"].includes(cls) ? cls : "irrelevant";
}

async function extractConceptName(plugin: MeridianPlugin, content: string): Promise<string | null> {
  const excerpt = content.slice(0, 1000);
  const response = await plugin.llmClient.complete(
    [{
      role: "user",
      content: `What is the main concept in this content? Reply with ONLY the concept name (2-5 words), nothing else.\n\nContent:\n${excerpt}`,
    }],
    undefined,
    30
  );
  const name = response.text.trim();
  return name.length > 1 && name.length < 60 ? name : null;
}

async function mapToNoteSections(
  plugin: MeridianPlugin,
  content: string,
  conceptName: string,
  existingContent: string | null,
  userRole: string
): Promise<string | null> {
  const soWhatPreserved = existingContent
    ? extractExistingSoWhat(existingContent, userRole)
    : null;

  const soWhatSection = soWhatPreserved && soWhatPreserved !== ""
    ? soWhatPreserved
    : `*← Yours. One sentence on how this applies to your work. Fill this in after studying.*`;

  const prompt = `Convert this content into a concept note for: "${conceptName}"

Source content:
${content.slice(0, 3000)}

Output this EXACT format (Obsidian markdown):

---
tags: [concept, draft]
status: draft
prerequisites: []
related: []
so_what_filled: ${soWhatPreserved ? "true" : "false"}
confidence: 0
connections: 0
last_reviewed: null
last_applied: null
---

# ${conceptName}

## What it is
[2-3 sentences from the content]

## How it works
[Key mechanism or steps from the content]

## Example
[Best example from the content, or derive one relevant to ${userRole}]

## So what for ${userRole}
${soWhatSection}

## Related
[any related concepts you can infer]`;

  try {
    const response = await plugin.llmClient.complete(
      [{ role: "user", content: prompt }],
      SYSTEM_PROMPT,
      4096
    );
    return stripCodeFence(response.text);
  } catch {
    return null;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function extractExistingSoWhat(content: string, userRole: string): string | null {
  const re = new RegExp(`## So what for ${userRole}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`, "i");
  const m = content.match(re);
  if (!m) return null;
  const text = m[1].trim();
  // Return null if it's just the placeholder
  if (text.startsWith("*←") || text.length < 5) return null;
  return text;
}

async function archiveFile(app: App, file: TFile, base: string): Promise<void> {
  const processedDir = `${base}/inbox/${INBOX_PROCESSED}`;
  try { await app.vault.createFolder(processedDir); } catch { /* exists */ }
  const destPath = `${processedDir}/${file.name}`;
  try {
    await app.fileManager.renameFile(file, destPath);
  } catch {
    // If rename fails (name conflict), add date suffix
    const stem = file.basename;
    const ext = file.extension;
    const today = new Date().toISOString().slice(0, 10);
    await app.fileManager.renameFile(file, `${processedDir}/${stem}-${today}.${ext}`);
  }
}

async function updateMemoryForNewNote(plugin: MeridianPlugin, stem: string): Promise<void> {
  const memory = await plugin.loadMemory();
  if (!memory) return;
  if (!memory.topics[stem]) {
    const { emptyTopic } = await import("./memory");
    memory.topics[stem] = emptyTopic(stem);
  }
  memory.topics[stem].note_status = "draft";
  memory.note_activity.drafts_generated += 1;
  memory.last_updated = new Date().toISOString().slice(0, 10);
  await plugin.saveMemory(memory);
}
