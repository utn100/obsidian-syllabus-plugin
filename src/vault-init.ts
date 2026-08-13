// Vault folder initialisation — creates the Syllabus directory tree on first enable

import { App, Notice } from "obsidian";
import type { MeridianSettings } from "./settings";

// Check for recommended community plugins and warn if missing
export function checkDependencies(app: App): void {
  const plugins = (app as any).plugins?.plugins ?? {};
  const missing: string[] = [];

  if (!plugins["dataview"]) {
    missing.push("Dataview (for dashboard queries)");
  }

  if (missing.length > 0) {
    new Notice(
      `Syllabus recommends these plugins for full functionality:\n${missing.join("\n")}\n\nInstall them from Community Plugins → Browse.`,
      10000
    );
  }
}

async function ensureFolder(app: App, path: string): Promise<void> {
  try {
    await app.vault.createFolder(path);
  } catch (e) {
    // Ignore "Folder already exists" — it's fine
    const msg = (e as Error).message ?? "";
    if (!msg.includes("already exists")) throw e;
  }
}

async function ensureFile(app: App, path: string, content: string): Promise<void> {
  if (!app.vault.getAbstractFileByPath(path)) {
    try {
      await app.vault.create(path, content);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!msg.includes("already exists")) throw e;
    }
  }
}

export async function initVaultFolders(
  app: App,
  settings: MeridianSettings
): Promise<void> {
  const base = settings.meridianFolder;
  const folders = [
    base,
    `${base}/concepts`,
    `${base}/plans`,
    `${base}/daily-briefs`,
    `${base}/weekly-reviews`,
    `${base}/work-notes`,
    `${base}/inbox`,
    `${base}/inbox/processed`,
    `${base}/.meridian`,
  ];

  for (const folder of folders) {
    await ensureFolder(app, folder);
  }

  await ensureFile(app, `${base}/plans/plan-feedback.md`, PLAN_FEEDBACK_STUB);
  await ensureFile(app, `${base}/memory.json`, JSON.stringify(EMPTY_MEMORY, null, 2));
}

const PLAN_FEEDBACK_STUB = `# Plan Feedback

Add feedback below. Each entry is read by the Refine plan command.
Keep all previous entries — append new ones with a date heading.

\`\`\`syllabus-refine
\`\`\`

---

## ${new Date().toISOString().slice(0, 10)} — Initial feedback
<!-- Write your feedback here, e.g.:
- Week 3 feels too dense — split across two weeks
- Move RLHF earlier, it's directly relevant to my work
- Add a week on causal inference
-->
`;

const EMPTY_MEMORY = {
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
