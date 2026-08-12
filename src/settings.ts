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
  customRole: string;
  briefTime: string;

  // Notifications
  briefOnOpen: boolean;
  connectionToasts: boolean;
  streakAlertTime: string;
  weeklyReviewDay: number;
  weeklyReviewTime: string;

  // Embeddings
  embeddingBackend: "openai" | "local";

  // Persisted onboarding inputs — reloaded when wizard reopens
  savedGoals: string;
  savedContext: string;
  savedLanguageGoal: string;
  savedHoursPerWeek: number;
  savedDurationMonths: number;

  // Internal
  lastBriefDate: string;
  lastWeeklyReviewDate: string;
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
  weeklyReviewDay: 0,
  weeklyReviewTime: "20:00",

  embeddingBackend: "openai",

  savedGoals: "",
  savedContext: "",
  savedLanguageGoal: "",
  savedHoursPerWeek: 10,
  savedDurationMonths: 6,

  lastBriefDate: "",
  lastWeeklyReviewDate: "",
};
