// Toast notifications — lightweight, auto-dismissing notices with action buttons

import { App } from "obsidian";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

// Global registry for cleanup on plugin unload
const activeToasts: Set<Toast> = new Set();

export function dismissAllToasts(): void {
  for (const t of activeToasts) t.dismiss();
  activeToasts.clear();
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
    this.el.addClass("syllabus-toast");
    this.render();
    // Use activeDocument for multi-window support (Obsidian guideline)
    const body = (app as any).activeDocument?.body ?? document.body;
    body.appendChild(this.el);
    activeToasts.add(this);
    this.timer = setTimeout(() => this.dismiss(), this.durationMs);
  }

  private render(): void {
    this.el.empty();
    const content = this.el.createDiv("syllabus-toast-content");
    content.createEl("span", { text: "⚡ ", cls: "syllabus-toast-icon" });
    content.createEl("span", { text: this.message, cls: "syllabus-toast-message" });

    if (this.actions.length > 0) {
      const actionsEl = this.el.createDiv("syllabus-toast-actions");
      for (const action of this.actions) {
        const btn = actionsEl.createEl("button", {
          text: action.label,
          cls: "syllabus-toast-btn",
        });
        btn.addEventListener("click", () => {
          action.onClick();
          this.dismiss();
        });
      }
    }

    this.el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).tagName !== "BUTTON") this.dismiss();
    });
  }

  dismiss(): void {
    if (this.timer) clearTimeout(this.timer);
    this.el.addClass("syllabus-toast-hiding");
    setTimeout(() => {
      this.el.remove();
      activeToasts.delete(this);
    }, 300);
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
