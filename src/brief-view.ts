// Daily brief sidebar panel — ItemView rendered in Obsidian's right sidebar

import { App, ItemView, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type MeridianPlugin from "./main";
import { computeBriefContext, type BriefContext } from "./brief-context";
import { SYSTEM_PROMPT } from "./prompts";
import type { Memory } from "./memory";

export const BRIEF_VIEW_TYPE = "syllabus-brief";

export class BriefView extends ItemView {
  private context: BriefContext | null = null;

  constructor(leaf: WorkspaceLeaf, private plugin: MeridianPlugin) {
    super(leaf);
  }

  getViewType(): string { return BRIEF_VIEW_TYPE; }
  getDisplayText(): string { return "Syllabus Brief"; }
  getIcon(): string { return "book-open"; }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    // contentEl is the correct container for ItemView content
    const container = this.contentEl;
    container.empty();
    container.addClass("syllabus-brief-container");

    // Load memory
    const memory = await this.plugin.loadMemory();
    if (!memory) {
      container.createEl("p", {
        text: `Run setup first. (Looking in: ${this.plugin.settings.meridianFolder}/memory.json)`,
      });
      return;
    }

    // Show loading state
    const loading = container.createEl("p", { text: "⏳ Loading brief...", cls: "syllabus-loading" });
    const debugEl = container.createEl("p", { cls: "syllabus-hint" });
    debugEl.setText(`Reading plan from: ${this.plugin.settings.meridianFolder}/plans/learning-plan.md | Topics in memory: ${Object.keys(memory.topics).length}`);

    try {
      this.context = await computeBriefContext(
        this.app,
        this.plugin.settings,
        memory,
        this.plugin.indexer
      );
      loading.remove();
      this.renderBrief(container, this.context, memory);
    } catch (e) {
      loading.setText(`Error: ${(e as Error).message}`);
    }
  }

  private renderBrief(container: HTMLElement, ctx: BriefContext, memory: Memory): void {
    // Header
    const header = container.createDiv("syllabus-brief-header");
    header.createEl("h2", { text: `⚡ ${ctx.date}` });

    // Drift warning
    if (ctx.driftDays > 1) {
      header.createEl("p", {
        text: `⚠️ ${ctx.driftDays} days behind — catch up today`,
        cls: "syllabus-drift-warning",
      });
    }

    // Focus task
    const focusEl = container.createDiv("syllabus-focus-section");
    focusEl.createEl("h3", { text: "Today's focus" });
    const focusText = focusEl.createEl("p", { cls: "syllabus-focus-task" });
    focusText.setText(ctx.focusTask);
    if (ctx.focusReason) {
      focusEl.createEl("p", { text: ctx.focusReason, cls: "syllabus-focus-reason" });
    }
    if (ctx.resourcesThisWeek && ctx.resourcesThisWeek !== "see learning-plan.md") {
      focusEl.createEl("p", {
        text: `📚 ${ctx.resourcesThisWeek}`,
        cls: "syllabus-resources",
      });
    }

    // Related notes
    if (ctx.relatedNotes.length > 0) {
      const relatedEl = container.createDiv("syllabus-related-section");
      relatedEl.createEl("p", { text: "Related notes:", cls: "syllabus-section-label" });
      const relatedLinks = relatedEl.createEl("p", { cls: "syllabus-related-links" });
      ctx.relatedNotes.forEach((stem, i) => {
        const link = relatedLinks.createEl("a", {
          text: `[[${stem}]]`,
          cls: "syllabus-note-link",
        });
        link.addEventListener("click", () => this.openNote(stem));
        if (i < ctx.relatedNotes.length - 1) relatedLinks.appendText(" · ");
      });
      relatedEl.createEl("p", {
        text: "→ append there or create new note",
        cls: "syllabus-hint",
      });
    }

    // Language progress
    if (ctx.languageProgress.length > 0) {
      const langEl = container.createDiv("syllabus-lang-section");
      for (const lp of ctx.languageProgress) {
        const streakText = lp.streak > 0 ? ` 🔥 ${lp.streak}d` : "";
        langEl.createEl("p", {
          text: `${lp.name}: ${lp.task}${streakText}`,
          cls: "syllabus-lang-item",
        });
      }
    }

    // Capacity
    const metricsEl = container.createDiv("syllabus-metrics-section");
    metricsEl.createEl("p", {
      text: `Capacity: ${ctx.capacityPct}% (${ctx.soWhatFilled}/${ctx.totalTopics} notes filled)`,
      cls: "syllabus-capacity",
    });
    if (ctx.capacityPct < 60 && ctx.topNote) {
      const topNoteEl = metricsEl.createEl("p", { cls: "syllabus-top-note" });
      topNoteEl.appendText("→ Fill ");
      const link = topNoteEl.createEl("a", { text: `[[${ctx.topNote}]]`, cls: "syllabus-note-link" });
      link.addEventListener("click", () => this.openNote(ctx.topNote));
      topNoteEl.appendText(" today — write one sentence in 'So what'");
    }

    // Missed connection
    if (ctx.missedConnection) {
      metricsEl.createEl("p", {
        text: `💡 Missed yesterday: [[${ctx.missedConnection}]] had a generic connection — fill 'So what' for a specific one next time`,
        cls: "syllabus-missed",
      });
    }

    // Session checkboxes
    const checkEl = container.createDiv("syllabus-checks-section");
    checkEl.createEl("hr");
    checkEl.createEl("p", { text: "Mark yesterday complete:", cls: "syllabus-section-label" });
    this.addSessionCheckbox(checkEl, "ds-ml", "DS/ML session done", memory);
    for (const lp of ctx.languageProgress) {
      const key = lp.name.toLowerCase().replace(/\s+/g, "-");
      this.addSessionCheckbox(checkEl, key, `${lp.name} done`, memory);
    }

    // Action buttons
    const actionsEl = container.createDiv("syllabus-actions-section");
    actionsEl.createEl("hr");

    const openPlanBtn = actionsEl.createEl("button", { text: "Open learning plan" });
    openPlanBtn.addEventListener("click", () => {
      const planPath = `${this.plugin.settings.meridianFolder}/plans/learning-plan.md`;
      this.openFile(planPath);
    });

    const refreshBtn = actionsEl.createEl("button", { text: "↻ Refresh" });
    refreshBtn.addEventListener("click", async () => {
      refreshBtn.setText("Refreshing...");
      refreshBtn.disabled = true;
      await this.refresh();
    });
  }

  private addSessionCheckbox(
    container: HTMLElement,
    key: string,
    label: string,
    memory: Memory
  ): void {
    const today = new Date().toISOString().slice(0, 10);
    const todaySession = memory.sessions.find(s => s.date === today);
    const isChecked = todaySession?.completed.includes(key) ?? false;

    const row = container.createDiv("syllabus-check-row");
    const checkbox = row.createEl("input");
    checkbox.type = "checkbox";
    checkbox.checked = isChecked;
    checkbox.id = `syllabus-check-${key}`;
    row.createEl("label", { text: label, attr: { for: `syllabus-check-${key}` } });

    checkbox.addEventListener("change", async () => {
      await this.plugin.markSessionComplete(key, checkbox.checked);
    });
  }

  private openNote(stem: string): void {
    const path = `${this.plugin.settings.meridianFolder}/concepts/${stem}.md`;
    this.openFile(path);
  }

  private openFile(path: string): void {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      this.app.workspace.getLeaf(false).openFile(file);
    } else {
      new Notice(`File not found: ${path}`);
    }
  }
}
