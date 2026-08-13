// Quick capture modal — Cmd+Shift+M or from connection toast
// Appends user's insight to a concept note's "So what" section

import { App, Modal, Notice, TFile } from "obsidian";
import type MeridianPlugin from "./main";

export class CaptureModal extends Modal {
  private textarea: HTMLTextAreaElement | null = null;
  private selectedStem: string;

  constructor(
    app: App,
    private plugin: MeridianPlugin,
    private conceptStem: string,
  ) {
    super(app);
    this.selectedStem = conceptStem;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("syllabus-capture-modal");

    contentEl.createEl("h3", { text: "⚡ Capture insight" });

    // Topic selector — dropdown if no concept pre-selected (B12)
    const topicRow = contentEl.createDiv("syllabus-capture-topic");
    topicRow.createEl("span", { text: "Topic: ", cls: "syllabus-section-label" });

    if (this.conceptStem) {
      // Pre-filled from bridge — show as link
      topicRow.createEl("span", {
        text: `[[${this.conceptStem}]]`,
        cls: "syllabus-note-link",
      });
    } else {
      // No concept — show a dropdown of all concept notes
      const select = topicRow.createEl("select", { cls: "syllabus-textarea" });
      select.style.width = "auto";
      select.style.padding = "2px 6px";

      const concepts = this.getConceptStems();
      if (concepts.length === 0) {
        const opt = select.createEl("option");
        opt.value = "";
        opt.text = "No concept notes found — run setup first";
        opt.disabled = true;
      } else {
        const placeholder = select.createEl("option");
        placeholder.value = "";
        placeholder.text = "Select a concept note...";
        for (const stem of concepts) {
          const opt = select.createEl("option");
          opt.value = stem;
          opt.text = stem.replace(/-/g, " ");
        }
      }

      select.addEventListener("change", () => {
        this.selectedStem = select.value;
      });
    }

    contentEl.createEl("p", {
      text: "What did you just figure out?",
      cls: "syllabus-capture-prompt",
    });

    this.textarea = contentEl.createEl("textarea", { cls: "syllabus-textarea" });
    this.textarea.rows = 4;
    this.textarea.placeholder =
      "One sentence on how this concept applies to your work right now...";
    this.textarea.focus();

    this.textarea.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        this.save();
      }
    });

    const footer = contentEl.createDiv("syllabus-footer");
    footer.createEl("button", { text: "Cancel" })
      .addEventListener("click", () => this.close());
    footer.createEl("button", { text: "Save to note  ⌘↵", cls: "mod-cta" })
      .addEventListener("click", () => this.save());
  }

  private getConceptStems(): string[] {
    const base = `${this.plugin.settings.meridianFolder}/concepts/`;
    return this.app.vault.getMarkdownFiles()
      .filter(f => f.path.startsWith(base))
      .map(f => f.basename)
      .sort();
  }

  private async save(): Promise<void> {
    const text = this.textarea?.value.trim();
    if (!text) { new Notice("Write something first"); return; }
    if (!this.selectedStem) { new Notice("Select a concept note first"); return; }

    const notePath = `${this.plugin.settings.meridianFolder}/concepts/${this.selectedStem}.md`;
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      new Notice(`Note not found: ${this.selectedStem}`);
      return;
    }

    try {
      await this.plugin.appendSoWhat(file, text);
      new Notice(`✓ Captured in [[${this.selectedStem}]]`);
      this.close();
    } catch (e) {
      new Notice(`Failed to save: ${(e as Error).message}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
