// Toast notifications — lightweight, auto-dismissing notices with action buttons
// Different from Obsidian's Notice: supports multiple action buttons and longer display

import { App } from "obsidian";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export class Toast {
  private el: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private app: App,
    private message: string,
    private actions: ToastAction[] = [],
    private durationMs = 8000
  ) {
    this.el = document.createElement("div");
    this.el.addClass("meridian-toast");
    this.render();
    document.body.appendChild(this.el);

    // Auto-dismiss
    this.timer = setTimeout(() => this.dismiss(), this.durationMs);
  }

  private render(): void {
    this.el.empty();

    const content = this.el.createDiv("meridian-toast-content");
    content.createEl("span", { text: "⚡ ", cls: "meridian-toast-icon" });
    content.createEl("span", { text: this.message, cls: "meridian-toast-message" });

    if (this.actions.length > 0) {
      const actionsEl = this.el.createDiv("meridian-toast-actions");
      for (const action of this.actions) {
        const btn = actionsEl.createEl("button", {
          text: action.label,
          cls: "meridian-toast-btn",
        });
        btn.addEventListener("click", () => {
          action.onClick();
          this.dismiss();
        });
      }
    }

    // Dismiss on click anywhere on toast
    this.el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).tagName !== "BUTTON") this.dismiss();
    });
  }

  dismiss(): void {
    if (this.timer) clearTimeout(this.timer);
    this.el.addClass("meridian-toast-hiding");
    setTimeout(() => this.el.remove(), 300);
  }

  static show(
    app: App,
    message: string,
    actions: ToastAction[] = [],
    durationMs = 8000
  ): Toast {
    return new Toast(app, message, actions, durationMs);
  }
}
