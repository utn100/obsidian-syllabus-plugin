// Plugin settings schema and defaults

import type { LLMProvider } from "./llm";

export interface MeridianSettings {
  // LLM
  provider: LLMProvider;
  apiKey: string;
  model: string;
  ollamaUrl: string;

  // Vault
  meridianFolder: string;
  workNotesFolder: string;

  // Profile
  userRole: string;
  customRole: string;  // used when userRole === "Other"
  briefTime: string; // "HH:MM"

  // Notifications
  briefOnOpen: boolean;
  connectionToasts: boolean;
  streakAlertTime: string; // "HH:MM"
  weeklyReviewDay: number; // 0=Sun … 6=Sat
  weeklyReviewTime: string; // "HH:MM"

  // Embeddings
  embeddingBackend: "openai" | "local";

  // Internal
  setupComplete: boolean;
  lastBriefDate: string; // "YYYY-MM-DD" or ""
  lastWeeklyReviewDate: string; // "YYYY-WNN" or ""
}

export const DEFAULT_SETTINGS: MeridianSettings = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-sonnet-latest",
  ollamaUrl: "http://localhost:11434",

  meridianFolder: "syllabus",
  workNotesFolder: "syllabus/work-notes",

  userRole: "PM",
  customRole: "",
  briefTime: "07:00",

  briefOnOpen: true,
  connectionToasts: true,
  streakAlertTime: "21:00",
  weeklyReviewDay: 0, // Sunday
  weeklyReviewTime: "20:00",

  embeddingBackend: "openai",

  setupComplete: false,
  lastBriefDate: "",
  lastWeeklyReviewDate: "",
};
