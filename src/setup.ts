// Setup engine — plan generation + parallel note drafting

import { App, Notice, TFile } from "obsidian";
import type { LLMClient } from "./llm";
import type { MeridianSettings } from "./settings";
import type { Indexer } from "./indexer";
import { buildPlanPrompt, buildDraftPrompt, SYSTEM_PROMPT } from "./prompts";
import {
  emptyMemory, emptyTopic, extractTopicsFromPlan, stripCodeFence,
  type Memory,
} from "./memory";
import { initVaultFolders } from "./vault-init";

const MAX_CONCURRENT_DRAFTS = 5;

export interface SetupParams {
  goals: string;
  hoursPerWeek: number;
  startDate: string;
  endDate: string;
  userRole: string;
  context: string;
  languageGoal?: string; // e.g. "Chinese HSK 3 by 2027-01-15"
}

export interface SetupResult {
  topicsCount: number;
  draftedCount: number;
  failedCount: number;
  planPath: string;
}

export async function planExists(app: App, settings: MeridianSettings): Promise<boolean> {
  const planPath = `${settings.meridianFolder}/plans/learning-plan.md`;
  return !!app.vault.getAbstractFileByPath(planPath);
}

export async function runSetup(
  app: App,
  settings: MeridianSettings,
  llm: LLMClient,
  indexer: Indexer,
  params: SetupParams,
  onProgress: (step: string) => void,
  signal?: AbortSignal
): Promise<SetupResult> {
  const base = settings.meridianFolder;

  // Step 1: ensure vault folders exist
  onProgress("Creating vault structure...");
  await initVaultFolders(app, settings);

  // Step 2: generate plan
  onProgress("Generating learning plan (LLM)...");
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(params.startDate);
  const end = new Date(params.endDate);
  const durationWeeks = Math.max(1, Math.round((end.getTime() - start.getTime()) / (7 * 86400000)));

  const planPrompt = buildPlanPrompt({
    context: params.context,
    goals: params.goals,
    constraints: `- ${params.hoursPerWeek} hours/week available\n- Working full-time`,
    currentLevel: "Self-assessed — see goals above",
    hoursPerWeek: params.hoursPerWeek,
    startDate: params.startDate,
    endDate: params.endDate,
    durationWeeks,
    today,
    languageGoal: params.languageGoal?.trim() || undefined,
  });

  const planResponse = await llm.complete(
    [{ role: "user", content: planPrompt }],
    SYSTEM_PROMPT,
    16000,
    signal
  );
  signal?.throwIfAborted();
  const planText = stripCodeFence(planResponse.text).replace(/^-{3,}\s*\n(?=---)/, "");

  // Validate plan format — must contain at least one week header (M6)
  const hasWeeks = /^### Week \d+/m.test(planText);
  if (!hasWeeks) {
    throw new Error(
      "Generated plan is missing week headers (### Week N ...). " +
      "Try again — this can happen with very short goals. " +
      "Add more detail to your goals and background."
    );
  }

  // Step 3: write plan to vault
  onProgress("Writing plan to vault...");
  const planPath = `${base}/plans/learning-plan.md`;
  await writeVaultFile(app, planPath, planText);

  // Step 4: extract topics and init memory
  const topics = extractTopicsFromPlan(planText);
  onProgress(`Found ${topics.length} topics — initialising memory...`);

  const memory = emptyMemory();
  for (const slug of topics) {
    memory.topics[slug] = emptyTopic(slug);
    memory.knowledge_graph.concept_application_count[slug] = 0;
  }
  await writeVaultFile(
    app,
    `${base}/memory.json`,
    JSON.stringify(memory, null, 2)
  );

  // Step 5: draft missing concept notes in parallel (max 5 concurrent)
  const conceptsPath = `${base}/concepts`;
  const existing = new Set(
    app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(conceptsPath + "/"))
      .map(f => f.basename)
  );
  const missing = topics.filter(t => !existing.has(t));

  onProgress(`Drafting ${missing.length} concept notes...`);
  let draftedCount = 0;
  let failedCount = 0;

  // Process in batches of MAX_CONCURRENT_DRAFTS
  for (let i = 0; i < missing.length; i += MAX_CONCURRENT_DRAFTS) {
    const batch = missing.slice(i, i + MAX_CONCURRENT_DRAFTS);
    const results = await Promise.allSettled(
      batch.map((slug) => draftNote(app, llm, settings, slug, topics, params))
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        draftedCount++;
        onProgress(`Drafted ${draftedCount}/${missing.length} notes...`);
      } else {
        failedCount++;
        console.error("[Syllabus] draft failed:", result.reason);
      }
    }
  }

  // Step 6: write dashboard stub
  onProgress("Writing dashboard...");
  await writeDashboard(app, settings, topics);

  // Step 7: index all notes
  onProgress("Indexing concept notes...");
  await indexer.indexAll();

  return { topicsCount: topics.length, draftedCount, failedCount, planPath };
}

async function draftNote(
  app: App,
  llm: LLMClient,
  settings: MeridianSettings,
  slug: string,
  allTopics: string[],
  params: SetupParams
): Promise<void> {
  const prompt = buildDraftPrompt({
    topic: slug.replace(/-/g, " "),
    knownTopics: allTopics,
    userRole: params.userRole,
    context: params.context,
  });

  const response = await llm.complete(
    [{ role: "user", content: prompt }],
    SYSTEM_PROMPT,
    4096
  );

  const noteText = stripCodeFence(response.text);
  const notePath = `${settings.meridianFolder}/concepts/${slug}.md`;
  await writeVaultFile(app, notePath, noteText);
}

async function writeDashboard(
  app: App,
  settings: MeridianSettings,
  topics: string[]
): Promise<void> {
  const base = settings.meridianFolder;
  const today = new Date().toISOString().slice(0, 10);

  const dashboard = `---
tags: [syllabus, dashboard]
created: ${today}
---

# Syllabus Dashboard

## Capacity
\`\`\`dataview
TABLE so_what_filled as "So what filled", confidence as "Confidence"
FROM "${base}/concepts"
WHERE contains(tags, "concept")
SORT so_what_filled DESC
\`\`\`

## This week's focus
\`\`\`dataview
LIST
FROM "${base}/plans"
WHERE file.name = "learning-plan"
\`\`\`

## Topics tracked
${topics.length} topics | Open [[${base}/plans/learning-plan|learning plan]] to see full schedule.
`;

  await writeVaultFile(app, `${base}/dashboard.md`, dashboard);
}

async function writeVaultFile(
  app: App,
  path: string,
  content: string
): Promise<void> {
  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
    return;
  }
  // Ensure each parent folder segment exists
  const parts = path.split("/");
  parts.pop();
  let built = "";
  for (const part of parts) {
    built = built ? `${built}/${part}` : part;
    try {
      await app.vault.createFolder(built);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!msg.includes("already exists")) throw e;
    }
  }
  try {
    await app.vault.create(path, content);
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (msg.includes("already exists")) {
      // File appeared between our check and create — modify it instead
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await app.vault.modify(f, content);
    } else {
      throw e;
    }
  }
}
