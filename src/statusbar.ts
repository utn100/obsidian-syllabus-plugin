// Status bar item — shows capacity % and streak

import { App } from "obsidian";
import type { MeridianSettings } from "./settings";

export class StatusBar {
  private el: HTMLElement;

  constructor(private statusBarItem: HTMLElement) {
    this.el = statusBarItem;
    this.el.addClass("meridian-status");
    this.el.setText("⚡ Meridian");
  }

  update(capacity: number, streak: number): void {
    const streakText = streak > 0 ? `  Streak: ${streak}d 🔥` : "";
    this.el.setText(`⚡ Meridian  Capacity: ${capacity}%${streakText}`);
  }

  setConnecting(): void {
    this.el.setText("⚡ Meridian  Starting...");
  }

  setError(msg: string): void {
    this.el.setText(`⚡ Meridian  ${msg}`);
    this.el.addClass("meridian-status-error");
  }

  clearError(): void {
    this.el.removeClass("meridian-status-error");
  }
}
