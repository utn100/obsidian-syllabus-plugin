// Meridian — main plugin entrypoint

import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, type MeridianSettings } from "./settings";
import { MeridianSettingTab } from "./settings-tab";
import { makeLLMClient, type LLMClient } from "./llm";
import { StatusBar } from "./statusbar";
import { initVaultFolders } from "./vault-init";
import { Indexer } from "./indexer";
import { OnboardingModal } from "./onboarding";
import { BriefView, BRIEF_VIEW_TYPE } from "./brief-view";
import { calcCapacity, type Memory } from "./memory";

export default class MeridianPlugin extends Plugin {
  settings: MeridianSettings;
  llmClient: LLMClient;
  indexer: Indexer;
  private statusBar: StatusBar;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register brief sidebar view
    this.registerView(BRIEF_VIEW_TYPE, (leaf) => new BriefView(leaf, this));

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

    // Init vault folders on first enable (or if folder missing)
    this.app.workspace.onLayoutReady(async () => {
      if (!this.settings.setupComplete) {
        await initVaultFolders(this.app, this.settings);
      }

      // Load existing index from vault
      await this.indexer.init();

      // Auto-open brief if not yet shown today and setup is complete
      if (this.settings.setupComplete && this.settings.briefOnOpen) {
        const today = new Date().toISOString().slice(0, 10);
        if (this.settings.lastBriefDate !== today) {
          this.settings.lastBriefDate = today;
          await this.saveSettings();
          this.openBriefSidebar();
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
    // Clean up if needed in later phases
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
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      leaf.setViewState({ type: BRIEF_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
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
