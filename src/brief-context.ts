// Brief context computation — pure TypeScript, no LLM
// Mirrors Python agent/graph/daily_graph.py logic

import { App, TFile } from "obsidian";
import type { MeridianSettings } from "./settings";
import type { Memory } from "./memory";
import { calcCapacity } from "./memory";
import type { Indexer } from "./indexer";

export interface BriefContext {
  date: string;
  focusTask: string;
  focusReason: string;
  estimatedHours: string;
  resourcesThisWeek: string;
  relatedNotes: string[];        // stems of related concept notes
  driftDays: number;
  capacityPct: number;
  soWhatFilled: number;
  totalTopics: number;
  topNote: string;               // highest-value note to fill
  topNoteConnections: number;
  languageProgress: LanguageProgress[];
  missedConnection: string;      // concept name or ""
}

export interface LanguageProgress {
  name: string;
  streak: number;
  task: string;
  daysToExam: number | null;
  examName: string;
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function computeBriefContext(
  app: App,
  settings: MeridianSettings,
  memory: Memory,
  indexer: Indexer
): Promise<BriefContext> {
  const today = new Date().toISOString().slice(0, 10);
  const base = settings.meridianFolder;

  // Read plan
  const planPath = `${base}/plans/learning-plan.md`;
  const planFile = app.vault.getAbstractFileByPath(planPath);
  const planText = planFile instanceof TFile
    ? await app.vault.read(planFile)
    : "";

  // Focus task — next unchecked item in current week
  const { task, reason, hours, resources } = findFocusTask(planText, today);

  // Related concept notes for today's focus
  let relatedNotes: string[] = [];
  if (task && indexer.index.size() > 0) {
    try {
      const hits = await indexer.search(task, 4, 0.30);
      relatedNotes = hits.map(h => h.stem);
    } catch { /* embeddings not ready */ }
  }

  // Metrics
  const capacityPct = calcCapacity(memory);
  const topics = Object.entries(memory.topics);
  const soWhatFilled = topics.filter(([, v]) => v.so_what_filled).length;
  const totalTopics = topics.length;

  // Top note to fill — highest connection_count with so_what empty
  const topNoteEntry = topics
    .filter(([, v]) => !v.so_what_filled)
    .sort(([, a], [, b]) => b.connection_count - a.connection_count)[0];
  const topNote = topNoteEntry?.[0] ?? "";
  const topNoteConnections = topNoteEntry?.[1].connection_count ?? 0;

  // Drift — days since last session
  const driftDays = calcDrift(memory, today);

  // Language progress
  const languageProgress = calcLanguageProgress(memory, settings, planText);

  // Missed connection — last bridge that fired on an incomplete note
  const missedConnection = findMissedConnection(memory);

  return {
    date: today,
    focusTask: task,
    focusReason: reason,
    estimatedHours: hours,
    resourcesThisWeek: resources,
    relatedNotes,
    driftDays,
    capacityPct,
    soWhatFilled,
    totalTopics,
    topNote,
    topNoteConnections,
    languageProgress,
    missedConnection,
  };
}

// ── Focus task ──────────────────────────────────────────────────────────────

function findFocusTask(planText: string, today: string): {
  task: string; reason: string; hours: string; resources: string;
} {
  if (!planText) {
    return { task: "Run setup to generate your learning plan", reason: "", hours: "", resources: "" };
  }

  const todayDate = new Date(today);
  const weekRe = /^### Week (\d+) \((\d{4}-\d{2}-\d{2})[^)]*\) [—–\-] (.+)$/;
  const lines = planText.split("\n");

  interface WeekBlock { weekNum: number; start: Date; end: Date; title: string; lineIdx: number; }
  const weeks: WeekBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(weekRe);
    if (m) {
      const startDate = new Date(m[2]);
      // End = 6 days after start (one week), used for current-week detection
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      weeks.push({
        weekNum: parseInt(m[1]),
        start: startDate,
        end: endDate,
        title: m[3],
        lineIdx: i,
      });
    }
  }

  // Find current week — today falls within week's 7-day range
  // Fall back to first future week, then week 1
  let weekIdx = weeks.findIndex(w => todayDate >= w.start && todayDate <= w.end);
  if (weekIdx === -1) weekIdx = weeks.findIndex(w => todayDate < w.start);
  if (weekIdx === -1) weekIdx = 0;
  if (weeks.length === 0) {
    return { task: "Open your learning plan to see this week's tasks", reason: "", hours: "", resources: "" };
  }

  const week = weeks[weekIdx];
  const endLine = weekIdx + 1 < weeks.length ? weeks[weekIdx + 1].lineIdx : lines.length;

  // Extract unchecked tasks and resources from this week
  const uncheckedTasks: string[] = [];
  let resources = "see learning-plan.md";

  for (let i = week.lineIdx; i < endLine; i++) {
    const line = lines[i];
    if (line.includes("📚") || (line.includes("Resources") && line.includes("**"))) {
      const r = line.replace(/📚/g, "").replace(/\*\*[^*]+\*\*:?\s*/g, "").trim();
      if (r) resources = filterResourcesFromUnchecked(r, uncheckedTasks);
    }
    if (/^- \[ \]/.test(line)) {
      uncheckedTasks.push(line.replace(/^- \[ \] /, "").trim());
    }
  }

  if (uncheckedTasks.length === 0) {
    return {
      task: "All tasks done this week — great work!",
      reason: `Week: ${week.title}`,
      hours: "30 min",
      resources,
    };
  }

  const task = uncheckedTasks[0];
  const hoursMatch = task.match(/[—\-]\s*(\d+(?:\.\d+)?)\s*hrs?/);
  const hours = hoursMatch ? `${hoursMatch[1]} hr` : "45 min";

  return {
    task: task.replace(/\s*[—\-]\s*\d+(?:\.\d+)?\s*hrs?.*$/, "").trim(),
    reason: `Week ${week.weekNum}: ${week.title}`,
    hours,
    resources,
  };
}

function filterResourcesFromUnchecked(fullResources: string, uncheckedTasks: string[]): string {
  // Extract resource names mentioned in unchecked tasks
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const task of uncheckedTasks) {
    // Italic titles
    for (const m of task.matchAll(/\*([^*]+)\*/g)) {
      const ref = m[1].trim();
      if (!seen.has(ref.toLowerCase())) { seen.add(ref.toLowerCase()); refs.push(`*${ref}*`); }
    }
    // Named resources
    for (const m of task.matchAll(/(StatQuest|ISLR2|Géron|S&B|David Silver|Lilian Weng|LangGraph|HuggingFace|Hamel|Karpathy|fast\.ai)[^;,\n(]{0,50}/g)) {
      const ref = m[0].trim().replace(/\s*[—\-].*$/, "");
      if (!seen.has(ref.slice(0, 15).toLowerCase())) { seen.add(ref.slice(0, 15).toLowerCase()); refs.push(ref); }
    }
  }
  return refs.length > 0 ? refs.join("; ") : fullResources;
}

// ── Drift ───────────────────────────────────────────────────────────────────

function calcDrift(memory: Memory, today: string): number {
  // Only count sessions where something was actually completed (B6)
  const completedSessions = memory.sessions.filter(s => s.completed.length > 0);
  if (completedSessions.length === 0) return 0;
  const last = completedSessions[completedSessions.length - 1].date;
  const diffMs = new Date(today).getTime() - new Date(last).getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  return Math.max(0, diffDays - 1);
}

// ── Language progress ────────────────────────────────────────────────────────

function calcLanguageProgress(
  memory: Memory,
  settings: MeridianSettings,
  planText: string
): LanguageProgress[] {
  // Extract language goals from plan text (Daily schedule template section)
  const langRe = /\*\*Daily ([^*]+)\*\*[^:]*:\s*([^\n]+)/g;
  const found: LanguageProgress[] = [];

  for (const m of planText.matchAll(langRe)) {
    const name = m[1].trim();
    const streakKey = name.toLowerCase().replace(/\s+/g, "-");
    const streakEntry = memory.streaks[streakKey] ?? memory.streaks[`${streakKey}-anki`];
    const streak = streakEntry?.current ?? 0;

    // Parse today's activity from the schedule line
    const today = new Date();
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayName = dayNames[today.getDay()];
    const schedLine = m[2];
    let task = "Review + practice";
    const dayMatch = schedLine.match(new RegExp(`${dayName}[^→]*→\\s*([^|]+)`));
    if (dayMatch) task = dayMatch[1].trim();

    found.push({ name, streak, task, daysToExam: null, examName: "" });
  }

  return found;
}

// ── Missed connection ────────────────────────────────────────────────────────

function findMissedConnection(memory: Memory): string {
  // Find most recent generic connection on a note with so_what empty
  const topics = Object.entries(memory.topics)
    .filter(([, v]) => !v.so_what_filled && v.connection_quality.includes("generic"))
    .sort(([, a], [, b]) => (b.last_applied ?? "").localeCompare(a.last_applied ?? ""));
  return topics[0]?.[0] ?? "";
}
