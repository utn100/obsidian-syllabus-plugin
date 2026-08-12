// Syllabus — main plugin entrypoint

import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type MeridianSettings } from "./settings";
import { MeridianSettingTab } from "./settings-tab";
import { makeLLMClient, type LLMClient } from "./llm";
import { StatusBar } from "./statusbar";
import { initVaultFolders } from "./vault-init";
import { Indexer } from "./indexer";
import { OnboardingModal } from "./onboarding";
import { BriefView, BRIEF_VIEW_TYPE } from "./brief-view";
import { ReviewView, REVIEW_VIEW_TYPE, MeridianScheduler } from "./review";
import { calcCapacity, type Memory } from "./memory";
import { scheduleBridge, cancelBridge } from "./bridge";
import { CaptureModal } from "./capture-modal";
import { processInboxFile } from "./inbox";
import { runRefinePlan } from "./refine";

export default class MeridianPlugin extends Plugin {
  settings: MeridianSettings;
  llmClient: LLMClient;
  indexer: Indexer;
  private statusBar: StatusBar;
  private scheduler: MeridianScheduler;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register views
    this.registerView(BRIEF_VIEW_TYPE, (leaf) => new BriefView(leaf, this));
    this.registerView(REVIEW_VIEW_TYPE, (leaf) => new ReviewView(leaf, this));

    // Status bar
    this.statusBar = new StatusBar(this.addStatusBarItem());

    // Settings tab
    this.addSettingTab(new MeridianSettingTab(this.app, this));

    // Initialise LLM client
    this.refreshLLMClient();

    // Initialise indexer immediately — vault reads happen after layout ready
    this.indexer = new Indexer(this.app, this.settings);

    // Commands
    this.addCommand({
      id: "open-settings",
      name: "Open settings",
      callback: () => {
        // @ts-ignore — open settings to this plugin
        this.app.setting.openTabById(this.manifest.id);
      },
    });

    this.addCommand({
      id: "test-connection",
      name: "Test LLM connection",
      callback: async () => {
        const { testConnection } = await import("./llm");
        new Notice("Testing connection...");
        const err = await testConnection(this.llmClient);
        if (err) {
          new Notice(`Connection failed: ${err}`);
          this.statusBar.setError("Not connected");
        } else {
          new Notice("LLM connection OK");
          this.statusBar.clearError();
          this.statusBar.update(0, 0);
        }
      },
    });

    this.addCommand({
      id: "setup",
      name: "Set up learning plan",
      callback: () => new OnboardingModal(this.app, this).open(),
    });

    this.addCommand({
      id: "open-brief",
      name: "Open daily brief",
      callback: () => this.openBriefSidebar(),
    });

    this.addCommand({
      id: "open-review",
      name: "Open weekly review",
      callback: () => this.openReviewSidebar(),
    });

    this.addCommand({
      id: "capture",
      name: "Capture insight",
      callback: () => new CaptureModal(this.app, this, "").open(),
    });

    this.addCommand({
      id: "refine-plan",
      name: "Refine plan from feedback",
      callback: async () => {
        new Notice("Refining plan...");
        try {
          await runRefinePlan(this.app, this);
        } catch (e) {
          new Notice(`Refine failed: ${(e as Error).message}`, 6000);
        }
      },
    });

    this.addCommand({
      id: "sync",
      name: "Sync vault notes",
      callback: async () => {
        new Notice("Syncing and indexing concept notes...");
        try {
          await this.reindexAllNotes();
          new Notice("Sync complete");
        } catch (e) {
          new Notice(`Sync failed: ${(e as Error).message}`);
        }
      },
    });

    // Watch inbox folder for new files
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        const inboxPath = `${this.settings.meridianFolder}/inbox/`;
        if (!file.path.startsWith(inboxPath)) return;
        if (file.path.includes("/processed/")) return;
        if (!file.path.endsWith(".md")) return;
        // Small delay to ensure file is fully written
        setTimeout(() => processInboxFile(this.app, this, file as TFile), 500);
      })
    );

    // Start scheduler (weekly review, streak alerts)
    this.scheduler = new MeridianScheduler(this);
    this.scheduler.start();
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        if (!file.path.startsWith(this.settings.workNotesFolder + "/")) return;
        if (!file.path.endsWith(".md")) return;
        scheduleBridge(this.app, this, file.path);
      })
    );

    // Cancel bridge timer if file is deleted
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        cancelBridge(file.path);
      })
    );

    // Init vault folders on first enable (or if folder missing)
    this.app.workspace.onLayoutReady(async () => {
      await initVaultFolders(this.app, this.settings);

      // Load existing index from vault
      await this.indexer.init();

      // Auto-open brief if: notifications enabled, plan exists, not yet shown today
      if (this.settings.briefOnOpen) {
        const planPath = `${this.settings.meridianFolder}/plans/learning-plan.md`;
        const planExists = !!this.app.vault.getAbstractFileByPath(planPath);
        if (planExists) {
          const today = new Date().toISOString().slice(0, 10);
          if (this.settings.lastBriefDate !== today) {
            this.settings.lastBriefDate = today;
            await this.saveSettings();
            // Small delay so Obsidian workspace is fully ready
            setTimeout(() => this.openBriefSidebar(), 1000);
          }
        }
      }

      // Update status bar with capacity
      const memory = await this.loadMemory();
      if (memory) {
        const capacity = calcCapacity(memory);
        const streak = this.getTopStreak(memory);
        this.statusBar.update(capacity, streak);
      } else {
        this.statusBar.update(0, 0);
      }
    });
  }

  onunload(): void {
    this.scheduler?.stop();
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshLLMClient();
  }

  // Opens the brief sidebar panel — creates it if not already open
  openBriefSidebar(): void {
    const existing = this.app.workspace.getLeavesOfType(BRIEF_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    this.app.workspace.getLeaf("split").setViewState({
      type: BRIEF_VIEW_TYPE,
      active: true,
    });
  }

  openReviewSidebar(): void {
    const existing = this.app.workspace.getLeavesOfType(REVIEW_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    this.app.workspace.getLeaf("split").setViewState({
      type: REVIEW_VIEW_TYPE,
      active: true,
    });
  }

  // Read memory.json from vault
  async loadMemory(): Promise<Memory | null> {
    const path = `${this.settings.meridianFolder}/memory.json`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return null;
    try {
      const raw = await this.app.vault.read(file);
      return JSON.parse(raw) as Memory;
    } catch { return null; }
  }

  // Save memory.json to vault
  async saveMemory(memory: Memory): Promise<void> {
    const path = `${this.settings.meridianFolder}/memory.json`;
    const file = this.app.vault.getAbstractFileByPath(path);
    const content = JSON.stringify(memory, null, 2);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  // Mark a session activity as complete/incomplete for today
  async markSessionComplete(key: string, completed: boolean): Promise<void> {
    const memory = await this.loadMemory();
    if (!memory) return;
    const today = new Date().toISOString().slice(0, 10);
    let session = memory.sessions.find(s => s.date === today);
    if (!session) {
      session = { date: today, completed: [], skipped: [] };
      memory.sessions.push(session);
    }
    if (completed && !session.completed.includes(key)) {
      session.completed.push(key);
    } else if (!completed) {
      session.completed = session.completed.filter(k => k !== key);
    }
    memory.last_updated = today;
    await this.saveMemory(memory);
  }

  private getTopStreak(memory: Memory): number {
    const streaks = Object.values(memory.streaks);
    return streaks.length > 0 ? Math.max(...streaks.map(s => s.current)) : 0;
  }

  // Append or replace "So what" section in a concept note
  async appendSoWhat(file: TFile, text: string): Promise<void> {
    const content = await this.app.vault.read(file);
    const soWhatRe = new RegExp(
      `(## So what for ${this.userRole}|## So what)\\s*\\n[^#]*`,
      "i"
    );
    const today = new Date().toISOString().slice(0, 10);
    const newSection = `## So what for ${this.userRole}\n${text}\n*(captured ${today})*\n\n`;

    let updated: string;
    if (soWhatRe.test(content)) {
      updated = content.replace(soWhatRe, newSection);
    } else {
      updated = content.trimEnd() + "\n\n" + newSection;
    }

    await this.app.vault.modify(file, updated);

    // Update memory
    const stem = file.basename;
    const memory = await this.loadMemory();
    if (memory && memory.topics[stem]) {
      memory.topics[stem].so_what_filled = true;
      memory.note_activity.so_what_sections_filled += 1;
      memory.last_updated = today;
      await this.saveMemory(memory);
    }

    // Update status bar
    const updatedMemory = await this.loadMemory();
    if (updatedMemory) {
      this.statusBar.update(calcCapacity(updatedMemory), this.getTopStreak(updatedMemory));
    }
  }

  // Returns the effective user role
  get userRole(): string {
    if (this.settings.userRole === "Other") {
      return this.settings.customRole || "Professional";
    }
    return this.settings.userRole;
  }

  refreshLLMClient(): void {
    this.llmClient = makeLLMClient(this.settings);
  }

  // Called from settings tab re-index button
  async reindexAllNotes(): Promise<void> {
    let lastNotice = Date.now();
    await this.indexer.indexAll((done, total) => {
      if (Date.now() - lastNotice > 2000) {
        new Notice(`Indexing notes... ${done}/${total}`);
        lastNotice = Date.now();
      }
    });
    await this.indexer.index.save();
    new Notice(`Indexed ${this.indexer.index.size()} concept notes`);
  }
}
