// Weekly review sidebar + scheduler

import { App, ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type MeridianPlugin from "./main";
import { calcCapacity } from "./memory";
import { SYSTEM_PROMPT } from "./prompts";

export const REVIEW_VIEW_TYPE = "syllabus-review";

// ── Weekly review view ─────────────────────────────────────────────────────

export class ReviewView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: MeridianPlugin) {
    super(leaf);
  }

  getViewType() { return REVIEW_VIEW_TYPE; }
  getDisplayText() { return "Syllabus Review"; }
  getIcon() { return "calendar-check"; }

  async onOpen() { await this.refresh(); }

  async refresh() {
    const container = this.contentEl;
    container.empty();
    container.addClass("syllabus-brief-container");

    const memory = await this.plugin.loadMemory();
    if (!memory) {
      container.createEl("p", { text: "Run setup first." });
      return;
    }

    const loading = container.createEl("p", { text: "⏳ Generating weekly review...", cls: "syllabus-loading" });

    try {
      const planText = await readPlanText(this.app, this.plugin);
      const ctx = computeReviewContext(memory, planText);
      const reviewText = await generateReviewText(this.plugin, ctx);
      loading.remove();
      this.renderReview(container, ctx, reviewText);
      await writeReviewFile(this.app, this.plugin, reviewText);
    } catch (e) {
      loading.setText(`Error: ${(e as Error).message}`);
    }
  }

  private renderReview(container: HTMLElement, ctx: ReviewContext, reviewText: string): void {
    const weekLabel = getWeekLabel();

    container.createEl("h2", { text: `⚡ Week ${weekLabel} Review` });

    // Stats row
    const statsEl = container.createDiv("syllabus-review-stats");
    statsEl.createEl("span", { text: `Sessions: ${ctx.sessionsCompleted}/${ctx.sessionsPlanned}` });
    statsEl.appendText(" · ");
    statsEl.createEl("span", { text: `Capacity: ${ctx.capacityPct}%` });
    statsEl.appendText(" · ");
    statsEl.createEl("span", { text: `Bridge: ${ctx.bridgeHigh} high / ${ctx.bridgeGeneric} generic` });

    // LLM review text
    if (reviewText) {
      const reviewEl = container.createDiv("syllabus-review-text");
      reviewEl.setText(reviewText);
    }

    // Applied this week
    if (ctx.appliedThisWeek.length > 0) {
      const el = container.createDiv("syllabus-review-section");
      el.createEl("p", { text: "Applied this week:", cls: "syllabus-section-label" });
      el.createEl("p", { text: ctx.appliedThisWeek.join(", ") });
    }

    // Never applied
    if (ctx.neverApplied.length > 0) {
      const el = container.createDiv("syllabus-review-section");
      el.createEl("p", { text: "Studied but never applied:", cls: "syllabus-section-label" });
      el.createEl("p", { text: ctx.neverApplied.join(", "), cls: "syllabus-hint" });
    }

    // Top notes to fill
    if (ctx.topNotesToFill.length > 0) {
      const el = container.createDiv("syllabus-review-section");
      el.createEl("p", { text: "Fill these first:", cls: "syllabus-section-label" });
      for (const note of ctx.topNotesToFill.slice(0, 3)) {
        const row = el.createEl("p");
        const link = row.createEl("a", { text: `[[${note.stem}]]`, cls: "syllabus-note-link" });
        link.addEventListener("click", () => {
          const path = `${this.plugin.settings.meridianFolder}/concepts/${note.stem}.md`;
          const file = this.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) this.app.workspace.getLeaf(false).openFile(file);
        });
        row.appendText(` — used ${note.connections}x in work notes`);
      }
    }

    // This week feels wrong
    container.createEl("hr");
    const feedbackBtn = container.createEl("button", { text: "This week feels wrong →" });
    feedbackBtn.addEventListener("click", async () => {
      const path = `${this.plugin.settings.meridianFolder}/plans/plan-feedback.md`;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(file);
        new Notice("Add your feedback, then run Cmd+P → Meridian: Refine plan");
      }
    });

    const refreshBtn = container.createEl("button", { text: "↻ Refresh" });
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.setText("Refreshing...");
      refreshBtn.disabled = true;
      await this.refresh();
    });
  }
}

// ── Review context ─────────────────────────────────────────────────────────

interface ReviewContext {
  weekLabel: string;
  sessionsCompleted: number;
  sessionsPlanned: number;
  capacityPct: number;
  bridgeHigh: number;
  bridgeGeneric: number;
  appliedThisWeek: string[];
  neverApplied: string[];
  topNotesToFill: Array<{ stem: string; connections: number }>;
}

function computeReviewContext(
  memory: import("./memory").Memory,
  planText: string
): ReviewContext {
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay()); // Sunday
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  // Count completed tasks in the current week block of the plan
  const { completed: planTasksDone, total: planTasksTotal } =
    countWeeklyPlanTasks(planText, today);

  // Also count plugin session checkboxes as a fallback
  const weekSessions = memory.sessions.filter(s => s.date >= weekStartStr);
  const sessionsDone = weekSessions.reduce((n, s) => n + s.completed.length, 0);

  // Use plan tasks if available, fall back to session checkboxes
  const sessionsCompleted = planTasksDone > 0 ? planTasksDone : sessionsDone;
  const sessionsPlanned = planTasksTotal > 0 ? planTasksTotal : 5;

  // Applied this week — topics with last_applied in current week
  const appliedThisWeek = Object.entries(memory.topics)
    .filter(([, v]) => v.last_applied && v.last_applied >= weekStartStr)
    .map(([k]) => k);

  // Never applied — studied >21 days ago, application_count = 0
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 21);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const neverApplied = Object.entries(memory.topics)
    .filter(([k, v]) =>
      (memory.knowledge_graph.concept_application_count[k] ?? 0) === 0 &&
      v.last_reviewed && v.last_reviewed <= cutoffStr
    )
    .map(([k]) => k)
    .slice(0, 5);

  // Top notes to fill
  const topNotesToFill = Object.entries(memory.topics)
    .filter(([, v]) => !v.so_what_filled && v.connection_count > 0)
    .sort(([, a], [, b]) => b.connection_count - a.connection_count)
    .slice(0, 3)
    .map(([stem, v]) => ({ stem, connections: v.connection_count }));

  return {
    weekLabel: getWeekLabel(),
    sessionsCompleted,
    sessionsPlanned,
    capacityPct: calcCapacity(memory),
    bridgeHigh: memory.bridge_stats.high_quality,
    bridgeGeneric: memory.bridge_stats.generic,
    appliedThisWeek,
    neverApplied,
    topNotesToFill,
  };
}

// ── Plan task counting ─────────────────────────────────────────────────────

async function readPlanText(app: App, plugin: MeridianPlugin): Promise<string> {
  const path = `${plugin.settings.meridianFolder}/plans/learning-plan.md`;
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return "";
  return app.vault.read(file);
}

function countWeeklyPlanTasks(
  planText: string,
  today: Date
): { completed: number; total: number } {
  if (!planText) return { completed: 0, total: 0 };

  const weekRe = /^### Week \d+ \((\d{4}-\d{2}-\d{2})[^)]*\) [—–\-] (.+)$/;
  const lines = planText.split("\n");

  // Find current week block
  let currentWeekStart = -1;
  let nextWeekStart = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(weekRe);
    if (!m) continue;
    const weekDate = new Date(m[1]);
    const weekEnd = new Date(weekDate);
    weekEnd.setDate(weekEnd.getDate() + 6);

    if (today >= weekDate && today <= weekEnd) {
      currentWeekStart = i;
    } else if (currentWeekStart >= 0 && i > currentWeekStart) {
      nextWeekStart = i;
      break;
    }
  }

  if (currentWeekStart === -1) return { completed: 0, total: 0 };

  let completed = 0;
  let total = 0;
  for (let i = currentWeekStart; i < nextWeekStart; i++) {
    const line = lines[i];
    if (/^- \[x\]/i.test(line)) { completed++; total++; }
    else if (/^- \[ \]/.test(line)) { total++; }
  }

  return { completed, total };
}

// ── LLM review text ────────────────────────────────────────────────────────

async function generateReviewText(plugin: MeridianPlugin, ctx: ReviewContext): Promise<string> {
  const prompt = `Write a concise weekly learning review (under 150 words).

Data:
- Sessions completed: ${ctx.sessionsCompleted}/${ctx.sessionsPlanned}
- Capacity: ${ctx.capacityPct}%
- Bridge quality: ${ctx.bridgeHigh} high-quality connections, ${ctx.bridgeGeneric} generic
- Applied this week: ${ctx.appliedThisWeek.join(", ") || "none"}
- Never applied: ${ctx.neverApplied.join(", ") || "none"}
- Top notes to fill: ${ctx.topNotesToFill.map(n => n.stem).join(", ") || "none"}

Write:
1. One sentence on how the week went
2. One specific recommendation for next week (concrete, actionable)

Be direct. No fluff. Output only these 2 sentences.`;

  try {
    const response = await plugin.llmClient.complete(
      [{ role: "user", content: prompt }],
      SYSTEM_PROMPT,
      256
    );
    return response.text.trim();
  } catch {
    return "";
  }
}

// ── Write review file ──────────────────────────────────────────────────────

async function writeReviewFile(app: App, plugin: MeridianPlugin, reviewText: string): Promise<void> {
  const weekLabel = getWeekLabel();
  const today = new Date().toISOString().slice(0, 10);
  const path = `${plugin.settings.meridianFolder}/weekly-reviews/${weekLabel}.md`;

  const content = `---
tags: [meridian, weekly-review]
week: ${weekLabel}
created: ${today}
---

# Weekly Review — ${weekLabel}

${reviewText}
`;

  const existing = app.vault.getAbstractFileByPath(path);
  if (existing instanceof TFile) {
    await app.vault.modify(existing, content);
  } else {
    try { await app.vault.create(path, content); } catch { /* already exists */ }
  }
}

// ── Scheduler ──────────────────────────────────────────────────────────────

export class MeridianScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(private plugin: MeridianPlugin) {}

  start(): void {
    // Check every minute
    this.intervalId = setInterval(() => this.tick(), 60000);
  }

  stop(): void {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private async tick(): Promise<void> {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const dayOfWeek = now.getDay(); // 0=Sun
    const settings = this.plugin.settings;

    // Weekly review — configured day + time
    if (dayOfWeek === settings.weeklyReviewDay && hhmm === settings.weeklyReviewTime) {
      const weekLabel = getWeekLabel();
      if (settings.lastWeeklyReviewDate !== weekLabel) {
        settings.lastWeeklyReviewDate = weekLabel;
        await this.plugin.saveSettings();
        this.plugin.openReviewSidebar();
      }
    }

    // Streak at risk — configured time, if language not logged today
    if (hhmm === settings.streakAlertTime) {
      await this.checkStreakAlert();
    }
  }

  private async checkStreakAlert(): Promise<void> {
    const memory = await this.plugin.loadMemory();
    if (!memory) return;
    const today = new Date().toISOString().slice(0, 10);
    const todaySession = memory.sessions.find(s => s.date === today);

    // Check if any language key was completed today
    const langKeys = Object.keys(memory.streaks);
    const anyLogged = langKeys.some(k => todaySession?.completed.includes(k));
    if (!anyLogged && langKeys.length > 0) {
      const { Toast } = await import("./toast");
      const streakVal = Math.max(...langKeys.map(k => memory.streaks[k]?.current ?? 0));
      Toast.show(
        this.plugin.app,
        `Streak at risk — ${streakVal} day streak. Log your language study before midnight.`,
        [{ label: "Log done", onClick: async () => {
          for (const k of langKeys) {
            await this.plugin.markSessionComplete(k, true);
          }
        }}],
        12000
      );
    }
  }
}

// ── Helper ─────────────────────────────────────────────────────────────────

function getWeekLabel(): string {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, "0")}`;
}
