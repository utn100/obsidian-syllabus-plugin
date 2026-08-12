// Status bar item — shows capacity % and streak, clickable for menu

import { Menu } from "obsidian";
import type { MeridianSettings } from "./settings";

export class StatusBar {
  private el: HTMLElement;

  constructor(
    private statusBarItem: HTMLElement,
    private onMenuRequest: (evt: MouseEvent) => void
  ) {
    this.el = statusBarItem;
    this.el.addClass("syllabus-status");
    this.el.style.cursor = "pointer";
    this.el.setText("📚 Syllabus");
    this.el.addEventListener("click", (evt) => this.onMenuRequest(evt));
  }

  update(capacity: number, streak: number): void {
    const streakText = streak > 0 ? `  Streak: ${streak}d 🔥` : "";
    this.el.setText(`📚 Syllabus  Capacity: ${capacity}%${streakText}`);
  }

  setConnecting(): void {
    this.el.setText("📚 Syllabus  Starting...");
  }

  setError(msg: string): void {
    this.el.setText(`📚 Syllabus  ${msg}`);
    this.el.addClass("syllabus-status-error");
  }

  clearError(): void {
    this.el.removeClass("syllabus-status-error");
  }
}
