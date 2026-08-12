// Onboarding wizard modal — guides user through first-time setup

import { App, Modal, Notice, Setting } from "obsidian";
import type MeridianPlugin from "./main";
import { runSetup, planExists, type SetupParams } from "./setup";
import { ConfirmModal } from "./confirm-modal";

const TEMPLATES: Record<string, Partial<SetupParams>> = {
  "pm-ml": {
    goals:
      "Rebuild DS/ML foundations to PM-level depth — able to challenge DS partners, write ML feature PRDs, evaluate model quality. Learn Reinforcement Learning and RLHF/DPO. Build agentic AI skills through hands-on LangGraph projects.",
    context:
      "Product Manager with technical background. Learning goal tied to AI/ML product role. Writes PRDs and meets with data science partners regularly.",
  },
  "engineer-sysdesign": {
    goals:
      "Master system design patterns for distributed systems. Learn ML engineering and model deployment. Improve leadership and technical communication skills.",
    context:
      "Software engineer moving toward staff or engineering manager role. Works on backend systems and collaborates with ML teams.",
  },
  "career-ml": {
    goals:
      "Build strong ML/Data Science fundamentals from scratch. Learn Python, statistics, supervised learning, neural networks, and how to deploy models. Build portfolio projects.",
    context:
      "Career switcher targeting a data science or ML engineering role. Coming from a non-technical background.",
  },
  "language": {
    goals:
      "Reach conversational fluency and pass a language certification exam. Focus on vocabulary, listening comprehension, and reading.",
    context: "Adult learner with a busy professional schedule.",
  },
  "custom": {
    goals: "",
    context: "",
  },
};

export class OnboardingModal extends Modal {
  private params: SetupParams;
  private progressEl: HTMLElement | null = null;

  constructor(app: App, private plugin: MeridianPlugin) {
    super(app);
    // Reload saved values from previous session
    const s = plugin.settings;
    this.params = {
      goals: s.savedGoals || "",
      hoursPerWeek: s.savedHoursPerWeek || 10,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: addMonths(new Date(), s.savedDurationMonths || 6).toISOString().slice(0, 10),
      userRole: plugin.userRole,
      context: s.savedContext || "",
      languageGoal: s.savedLanguageGoal || "",
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("syllabus-onboarding");

    contentEl.createEl("h2", { text: "📚 Welcome to Syllabus" });
    contentEl.createEl("p", {
      text: "Let's set up your personalised learning plan. This takes about 2 minutes.",
      cls: "syllabus-subtitle",
    });

    // ── Template picker ──────────────────────────────────────────────────

    contentEl.createEl("h3", { text: "What are you learning?" });

    const templateGrid = contentEl.createDiv("syllabus-template-grid");
    const templates = [
      { id: "pm-ml", label: "Technical PM — DS/ML + AI", emoji: "📊" },
      { id: "engineer-sysdesign", label: "Engineer — System Design + ML", emoji: "⚙️" },
      { id: "career-ml", label: "Career Switch → Data/ML", emoji: "🚀" },
      { id: "language", label: "Language Exam Prep", emoji: "🌏" },
      { id: "custom", label: "Custom — I'll describe it", emoji: "✏️" },
    ];

    let selectedTemplate = "pm-ml";
    this.applyTemplate("pm-ml");

    const templateButtons: HTMLElement[] = [];
    for (const t of templates) {
      const btn = templateGrid.createDiv("syllabus-template-btn syllabus-template-selected");
      btn.createEl("div", { text: t.emoji, cls: "syllabus-template-emoji" });
      btn.createEl("div", { text: t.label, cls: "syllabus-template-label" });
      btn.dataset.id = t.id;

      if (t.id !== "pm-ml") btn.removeClass("syllabus-template-selected");

      btn.addEventListener("click", () => {
        templateButtons.forEach((b) => b.removeClass("syllabus-template-selected"));
        btn.addClass("syllabus-template-selected");
        selectedTemplate = t.id;
        this.applyTemplate(t.id);
        goalsTextarea.value = this.params.goals;
        contextTextarea.value = this.params.context;
      });

      templateButtons.push(btn);
    }

    // ── Goals ────────────────────────────────────────────────────────────

    contentEl.createEl("h3", { text: "What do you want to achieve?" });
    const goalsTextarea = contentEl.createEl("textarea", {
      cls: "syllabus-textarea",
    });
    goalsTextarea.rows = 4;
    goalsTextarea.value = this.params.goals;
    goalsTextarea.placeholder =
      "e.g. Refresh my ML knowledge, learn RL, understand RLHF for AI product work";
    goalsTextarea.addEventListener("input", () => {
      this.params.goals = goalsTextarea.value;
      this.saveInputs();
    });

    // ── Context ──────────────────────────────────────────────────────────

    contentEl.createEl("h3", { text: "Your background (optional but recommended)" });
    const contextTextarea = contentEl.createEl("textarea", {
      cls: "syllabus-textarea",
    });
    contextTextarea.rows = 3;
    contextTextarea.value = this.params.context;
    contextTextarea.placeholder =
      "e.g. PM at a B2B SaaS company. Write PRDs for AI features. Work with DS partners weekly.";
    contextTextarea.addEventListener("input", () => {
      this.params.context = contextTextarea.value;
      this.saveInputs();
    });

    // ── Schedule ─────────────────────────────────────────────────────────

    contentEl.createEl("h3", { text: "Schedule" });

    new Setting(contentEl)
      .setName("Hours per week")
      .addSlider((s) =>
        s
          .setLimits(3, 20, 1)
          .setValue(this.params.hoursPerWeek)
          .setDynamicTooltip()
          .onChange((v) => { this.params.hoursPerWeek = v; })
      );

    new Setting(contentEl)
      .setName("Duration")
      .addDropdown((dd) =>
        dd
          .addOption("3", "3 months")
          .addOption("4", "4 months")
          .addOption("6", "6 months")
          .addOption("12", "12 months")
          .setValue("6")
          .onChange((v) => {
            this.params.endDate = addMonths(
              new Date(this.params.startDate),
              parseInt(v)
            ).toISOString().slice(0, 10);
          })
      );

    new Setting(contentEl)
      .setName("Start date")
      .addText((t) =>
        t
          .setValue(this.params.startDate)
          .onChange((v) => { this.params.startDate = v; })
      );

    // ── Language goal ────────────────────────────────────────────────────

    contentEl.createEl("h3", { text: "Language goal (optional)" });
    contentEl.createEl("p", {
      text: "If you're learning a language alongside your main goals, add it here.",
      cls: "syllabus-hint",
    });
    new Setting(contentEl)
      .setName("Language goal")
      .setDesc("e.g. Chinese HSK 3 by 2027-01-15, Spanish DELE B1")
      .addText((t) =>
        t
          .setPlaceholder("Leave blank if none")
          .onChange((v) => { this.params.languageGoal = v; })
      );

    // ── Progress indicator ───────────────────────────────────────────────

    this.progressEl = contentEl.createDiv("syllabus-progress");
    this.progressEl.hide();

    // ── Generate button ──────────────────────────────────────────────────

    const footer = contentEl.createDiv("syllabus-footer");
    const generateBtn = footer.createEl("button", {
      text: "Generate my learning plan →",
      cls: "mod-cta",
    });

    generateBtn.addEventListener("click", async () => {
      if (!this.params.goals.trim()) {
        new Notice("Please describe your learning goals first");
        return;
      }

      // Check if plan already exists — confirm before overwriting
      const exists = await planExists(this.app, this.plugin.settings);
      if (exists) {
        const confirmed = await ConfirmModal.ask(
          this.app,
          "Overwrite existing plan?",
          "A learning plan already exists. Generating a new one will overwrite it and reset memory.json. Existing concept notes will be kept.\n\nConsider using 'Refine plan' instead to make targeted changes.",
          "Yes, generate new plan"
        );
        if (!confirmed) return;
      }

      generateBtn.disabled = true;
      generateBtn.textContent = "Generating...";
      this.showProgress("Starting setup...");

      try {
        const result = await runSetup(
          this.app,
          this.plugin.settings,
          this.plugin.llmClient,
          this.plugin.indexer,
          this.params,
          (step) => this.showProgress(step)
        );

        this.plugin.settings.setupComplete = true;
        await this.plugin.saveSettings();

        this.close();
        new Notice(
          `✓ Setup complete! ${result.topicsCount} topics planned, ` +
          `${result.draftedCount} notes drafted. ` +
          `Open the Syllabus sidebar to see your first focus task.`
        );

        // Open daily brief sidebar after setup
        this.plugin.openBriefSidebar();

      } catch (e) {
        const msg = (e as Error).message ?? String(e);
        console.error("[Syllabus] setup error:", e);
        new Notice(`Setup failed: ${msg}`, 8000);
        generateBtn.disabled = false;
        generateBtn.textContent = "Generate my learning plan →";
        this.showProgress(`Error: ${msg}`);
      }
    });
  }

  private saveInputs(): void {
    this.plugin.settings.savedGoals = this.params.goals;
    this.plugin.settings.savedContext = this.params.context;
    this.plugin.settings.savedLanguageGoal = this.params.languageGoal ?? "";
    this.plugin.settings.savedHoursPerWeek = this.params.hoursPerWeek;
    this.plugin.saveSettings(); // fire-and-forget
  }

  private applyTemplate(id: string): void {
    const t = TEMPLATES[id] ?? TEMPLATES["custom"];
    if (t.goals !== undefined) this.params.goals = t.goals;
    if (t.context !== undefined) this.params.context = t.context;
  }

  private showProgress(msg: string): void {
    if (!this.progressEl) return;
    this.progressEl.show();
    this.progressEl.setText(`⏳ ${msg}`);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}
