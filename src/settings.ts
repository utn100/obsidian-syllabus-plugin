// Plugin settings schema and defaults

import type { LLMProvider } from "./llm";

export interface MeridianSettings {
  // LLM
  provider: LLMProvider;
  apiKey: string;
  model: string;
  ollamaUrl: string;

  // Embeddings (separate key needed when LLM is Anthropic/Ollama)
  embeddingBackend: "openai" | "local";
  openaiEmbeddingKey: string;  // used for embeddings when provider != openai

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
  lastStreakAlertDate: string;  // prevent multiple toasts per day

  // Persisted onboarding inputs
  savedGoals: string;
  savedContext: string;
  savedLanguageGoal: string;
  savedHoursPerWeek: number;
  savedDurationMonths: number;
  savedStartDate: string;

  // Internal
  setupComplete: boolean;
  lastBriefDate: string;
  lastWeeklyReviewDate: string;
  cachedReviewText: string;     // cache weekly review LLM output
  cachedReviewWeek: string;     // week label the cache belongs to
}

export const DEFAULT_SETTINGS: MeridianSettings = {
  provider: "anthropic",
  apiKey: "",
  model: "claude-sonnet-latest",
  ollamaUrl: "http://localhost:11434",

  embeddingBackend: "openai",
  openaiEmbeddingKey: "",

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
  lastStreakAlertDate: "",

  savedGoals: "",
  savedContext: "",
  savedLanguageGoal: "",
  savedHoursPerWeek: 10,
  savedDurationMonths: 6,
  savedStartDate: "",

  setupComplete: false,
  lastBriefDate: "",
  lastWeeklyReviewDate: "",
  cachedReviewText: "",
  cachedReviewWeek: "",
};
