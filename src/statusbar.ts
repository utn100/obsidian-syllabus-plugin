// Status bar item — shows capacity % and streak

import { App } from "obsidian";
import type { MeridianSettings } from "./settings";

export class StatusBar {
  private el: HTMLElement;

  constructor(private statusBarItem: HTMLElement) {
    this.el = statusBarItem;
    this.el.addClass("syllabus-status");
    this.el.setText("📚 Syllabus");
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
