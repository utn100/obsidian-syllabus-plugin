// Confirmation modal — shown before overwriting an existing plan

import { App, Modal } from "obsidian";

export class ConfirmModal extends Modal {
  private resolve: (confirmed: boolean) => void;

  constructor(
    app: App,
    private title: string,
    private message: string,
    private confirmLabel = "Yes, overwrite",
    private cancelLabel = "Cancel"
  ) {
    super(app);
    this.resolve = () => {};
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.message });

    const footer = contentEl.createDiv("meridian-footer");

    const cancelBtn = footer.createEl("button", { text: this.cancelLabel });
    cancelBtn.addEventListener("click", () => {
      this.resolve(false);
      this.close();
    });

    const confirmBtn = footer.createEl("button", {
      text: this.confirmLabel,
      cls: "mod-warning",
    });
    confirmBtn.addEventListener("click", () => {
      this.resolve(true);
      this.close();
    });
  }

  onClose(): void {
    this.resolve(false);
    this.contentEl.empty();
  }

  // Returns true if user confirmed, false if cancelled
  static async ask(
    app: App,
    title: string,
    message: string,
    confirmLabel?: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const modal = new ConfirmModal(app, title, message, confirmLabel);
      modal.resolve = resolve;
      modal.open();
    });
  }
}
