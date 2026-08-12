// Vault folder initialisation — creates the Meridian directory tree on first enable

import { App, TFolder } from "obsidian";
import type { MeridianSettings } from "./settings";

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
    if (!app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }
  }

  // Write stub files if they don't exist
  await ensureFile(
    app,
    `${base}/plans/plan-feedback.md`,
    PLAN_FEEDBACK_STUB
  );

  await ensureFile(
    app,
    `${base}/memory.json`,
    JSON.stringify(EMPTY_MEMORY, null, 2)
  );
}

async function ensureFile(
  app: App,
  path: string,
  content: string
): Promise<void> {
  if (!app.vault.getAbstractFileByPath(path)) {
    await app.vault.create(path, content);
  }
}

const PLAN_FEEDBACK_STUB = `# Plan Feedback

Add feedback below. Each entry is read by the Refine plan command.
Keep all previous entries — append new ones with a date heading.

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
