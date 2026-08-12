// Quick capture modal — Cmd+Shift+M or from connection toast
// Appends user's insight to a concept note's "So what" section

import { App, Modal, Notice, TFile } from "obsidian";
import type MeridianPlugin from "./main";

export class CaptureModal extends Modal {
  private textarea: HTMLTextAreaElement | null = null;

  constructor(
    app: App,
    private plugin: MeridianPlugin,
    private conceptStem: string,  // pre-filled from bridge match
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("meridian-capture-modal");

    contentEl.createEl("h3", { text: "⚡ Capture insight" });

    // Topic selector
    const topicRow = contentEl.createDiv("meridian-capture-topic");
    topicRow.createEl("span", { text: "Topic: ", cls: "meridian-section-label" });
    const topicEl = topicRow.createEl("span", {
      text: `[[${this.conceptStem}]]`,
      cls: "meridian-note-link",
    });

    contentEl.createEl("p", {
      text: "What did you just figure out?",
      cls: "meridian-capture-prompt",
    });

    this.textarea = contentEl.createEl("textarea", { cls: "meridian-textarea" });
    this.textarea.rows = 4;
    this.textarea.placeholder =
      "One sentence on how this concept applies to your work right now...";
    this.textarea.focus();

    // Save on Cmd+Enter
    this.textarea.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        this.save();
      }
    });

    const footer = contentEl.createDiv("meridian-footer");

    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = footer.createEl("button", {
      text: "Save to note  ⌘↵",
      cls: "mod-cta",
    });
    saveBtn.addEventListener("click", () => this.save());
  }

  private async save(): Promise<void> {
    const text = this.textarea?.value.trim();
    if (!text) {
      new Notice("Write something first");
      return;
    }

    const notePath = `${this.plugin.settings.meridianFolder}/concepts/${this.conceptStem}.md`;
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      new Notice(`Note not found: ${this.conceptStem}`);
      return;
    }

    try {
      await this.plugin.appendSoWhat(file, text);
      new Notice(`✓ Captured in [[${this.conceptStem}]]`);
      this.close();
    } catch (e) {
      new Notice(`Failed to save: ${(e as Error).message}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
