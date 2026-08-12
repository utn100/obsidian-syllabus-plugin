// Meridian — main plugin entrypoint

import { Notice, Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type MeridianSettings } from "./settings";
import { MeridianSettingTab } from "./settings-tab";
import { makeLLMClient, type LLMClient } from "./llm";
import { StatusBar } from "./statusbar";
import { initVaultFolders } from "./vault-init";

export default class MeridianPlugin extends Plugin {
  settings: MeridianSettings;
  llmClient: LLMClient;
  private statusBar: StatusBar;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Status bar
    this.statusBar = new StatusBar(this.addStatusBarItem());

    // Settings tab
    this.addSettingTab(new MeridianSettingTab(this.app, this));

    // Initialise LLM client
    this.refreshLLMClient();

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

    // Init vault folders on first enable (or if folder missing)
    this.app.workspace.onLayoutReady(async () => {
      if (!this.settings.setupComplete) {
        await initVaultFolders(this.app, this.settings);
      }
      this.statusBar.update(0, 0);
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

  refreshLLMClient(): void {
    this.llmClient = makeLLMClient(this.settings);
  }

  // Called from settings tab re-index button — stub for Phase B
  async reindexAllNotes(): Promise<void> {
    new Notice("Re-indexing notes... (embeddings coming in Phase B)");
  }
}
