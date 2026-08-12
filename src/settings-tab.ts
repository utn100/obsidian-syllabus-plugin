// Settings tab UI

import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type MeridianPlugin from "./main";
import { DEFAULT_MODELS, makeLLMClient, testConnection } from "./llm";
import type { LLMProvider } from "./llm";

export class MeridianSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: MeridianPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── LLM Provider ──────────────────────────────────────────────────────

    containerEl.createEl("h2", { text: "LLM Provider" });

    new Setting(containerEl)
      .setName("Provider")
      .setDesc("Which LLM provider to use for all AI calls")
      .addDropdown((dd) =>
        dd
          .addOption("anthropic", "Anthropic (Claude)")
          .addOption("openai", "OpenAI (GPT)")
          .addOption("ollama", "Ollama (local)")
          .setValue(this.plugin.settings.provider)
          .onChange(async (v) => {
            this.plugin.settings.provider = v as LLMProvider;
            // Auto-fill default model for provider
            this.plugin.settings.model = DEFAULT_MODELS[v as LLMProvider];
            await this.plugin.saveSettings();
            this.display(); // re-render to show/hide Ollama URL
          })
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Model name for the selected provider")
      .addText((t) =>
        t
          .setPlaceholder(DEFAULT_MODELS[this.plugin.settings.provider])
          .setValue(this.plugin.settings.model)
          .onChange(async (v) => {
            this.plugin.settings.model = v;
            await this.plugin.saveSettings();
          })
      );

    if (this.plugin.settings.provider === "ollama") {
      new Setting(containerEl)
        .setName("Ollama base URL")
        .setDesc("URL where Ollama is running")
        .addText((t) =>
          t
            .setPlaceholder("http://localhost:11434")
            .setValue(this.plugin.settings.ollamaUrl)
            .onChange(async (v) => {
              this.plugin.settings.ollamaUrl = v;
              await this.plugin.saveSettings();
            })
        );
    } else {
      new Setting(containerEl)
        .setName("API key")
        .setDesc(
          this.plugin.settings.provider === "anthropic"
            ? "Your Anthropic API key (sk-ant-...)"
            : "Your OpenAI API key (sk-...)"
        )
        .addText((t) => {
          t.inputEl.type = "password";
          t
            .setPlaceholder("Enter API key")
            .setValue(this.plugin.settings.apiKey)
            .onChange(async (v) => {
              this.plugin.settings.apiKey = v;
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Test connection")
        .setCta()
        .onClick(async () => {
          btn.setButtonText("Testing...").setDisabled(true);
          const client = makeLLMClient(this.plugin.settings);
          const err = await testConnection(client);
          btn.setButtonText("Test connection").setDisabled(false);
          if (err) {
            new Notice(`Connection failed: ${err}`);
          } else {
            new Notice("Connection successful");
          }
        })
    );

    // ── Vault ─────────────────────────────────────────────────────────────

    containerEl.createEl("h2", { text: "Vault" });

    new Setting(containerEl)
      .setName("Meridian folder")
      .setDesc("Folder inside your vault where Meridian stores all files")
      .addText((t) =>
        t
          .setPlaceholder("meridian")
          .setValue(this.plugin.settings.meridianFolder)
          .onChange(async (v) => {
            this.plugin.settings.meridianFolder = v.trim() || "meridian";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Work notes folder")
      .setDesc("Folder Meridian watches for work-learning bridge connections")
      .addText((t) =>
        t
          .setPlaceholder("meridian/work-notes")
          .setValue(this.plugin.settings.workNotesFolder)
          .onChange(async (v) => {
            this.plugin.settings.workNotesFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // ── Profile ───────────────────────────────────────────────────────────

    containerEl.createEl("h2", { text: "Profile" });

    new Setting(containerEl)
      .setName("User role")
      .setDesc('Drives the "So what for [role]" section in concept notes')
      .addDropdown((dd) =>
        dd
          .addOption("PM", "Product Manager")
          .addOption("Engineer", "Engineer")
          .addOption("Consultant", "Consultant")
          .addOption("Researcher", "Researcher")
          .addOption("Executive", "Executive")
          .addOption("Other", "Other (specify below)")
          .setValue(this.plugin.settings.userRole)
          .onChange(async (v) => {
            this.plugin.settings.userRole = v;
            await this.plugin.saveSettings();
            this.display(); // re-render to show/hide custom role field
          })
      );

    if (this.plugin.settings.userRole === "Other") {
      new Setting(containerEl)
        .setName("Custom role")
        .setDesc('Will appear as "So what for [your role]" in concept notes')
        .addText((t) =>
          t
            .setPlaceholder("e.g. Data Scientist, Designer, Teacher")
            .setValue(this.plugin.settings.customRole)
            .onChange(async (v) => {
              this.plugin.settings.customRole = v;
              await this.plugin.saveSettings();
            })
        );
    }

    // ── Notifications ─────────────────────────────────────────────────────

    containerEl.createEl("h2", { text: "Notifications" });

    new Setting(containerEl)
      .setName("Daily brief on open")
      .setDesc("Open the brief sidebar when Obsidian starts (once per day)")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.briefOnOpen)
          .onChange(async (v) => {
            this.plugin.settings.briefOnOpen = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Work connection toasts")
      .setDesc("Show a toast when a work-learning connection is found")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.connectionToasts)
          .onChange(async (v) => {
            this.plugin.settings.connectionToasts = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Streak alert time")
      .setDesc("Show a toast if language goal not logged by this time")
      .addText((t) =>
        t
          .setPlaceholder("21:00")
          .setValue(this.plugin.settings.streakAlertTime)
          .onChange(async (v) => {
            this.plugin.settings.streakAlertTime = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Weekly review time")
      .setDesc("Day and time to show the weekly review sidebar")
      .addDropdown((dd) =>
        dd
          .addOption("0", "Sunday")
          .addOption("1", "Monday")
          .setValue(String(this.plugin.settings.weeklyReviewDay))
          .onChange(async (v) => {
            this.plugin.settings.weeklyReviewDay = parseInt(v);
            await this.plugin.saveSettings();
          })
      )
      .addText((t) =>
        t
          .setPlaceholder("20:00")
          .setValue(this.plugin.settings.weeklyReviewTime)
          .onChange(async (v) => {
            this.plugin.settings.weeklyReviewTime = v;
            await this.plugin.saveSettings();
          })
      );

    // ── Embeddings ────────────────────────────────────────────────────────

    containerEl.createEl("h2", { text: "Embeddings" });

    new Setting(containerEl)
      .setName("Embedding backend")
      .setDesc(
        "OpenAI: uses text-embedding-3-small API (fast, requires API key). Local: not supported in this version."
      )
      .addDropdown((dd) =>
        dd
          .addOption("openai", "OpenAI API (recommended)")
          .addOption("local", "Local — not supported yet")
          .setValue(this.plugin.settings.embeddingBackend)
          .onChange(async (v) => {
            this.plugin.settings.embeddingBackend = v as "openai" | "local";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Re-index all notes")
      .setDesc("Rebuild the semantic search index from scratch")
      .addButton((btn) =>
        btn.setButtonText("Re-index").onClick(async () => {
          btn.setButtonText("Indexing...").setDisabled(true);
          await this.plugin.reindexAllNotes();
          btn.setButtonText("Re-index").setDisabled(false);
          new Notice("Re-index complete");
        })
      );
  }
}
