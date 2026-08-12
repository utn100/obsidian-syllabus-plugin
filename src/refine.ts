// Plan refinement — reads plan-feedback.md, applies surgical changes via LLM

import { App, Modal, TFile } from "obsidian";
import type MeridianPlugin from "./main";
import { SYSTEM_PROMPT } from "./prompts";
import { stripCodeFence, extractTopicsFromPlan } from "./memory";

export async function runRefinePlan(app: App, plugin: MeridianPlugin): Promise<void> {
  const base = plugin.settings.meridianFolder;
  const planPath = `${base}/plans/learning-plan.md`;
  const feedbackPath = `${base}/plans/plan-feedback.md`;

  const planFile = app.vault.getAbstractFileByPath(planPath);
  if (!(planFile instanceof TFile)) {
    throw new Error("No learning-plan.md found. Run setup first.");
  }

  const feedbackFile = app.vault.getAbstractFileByPath(feedbackPath);
  if (!(feedbackFile instanceof TFile)) {
    throw new Error("No plan-feedback.md found. Create it first.");
  }

  const currentPlan = await app.vault.read(planFile);
  const feedback = await app.vault.read(feedbackFile);

  // Check feedback has real content
  const meaningful = feedback.split("\n").filter(l =>
    l.trim() && !l.trim().startsWith("#") && !l.trim().startsWith("<!--") &&
    !l.trim().startsWith("-->") && l.trim() !== "---" &&
    !l.includes("Write your feedback here")
  );
  if (meaningful.length === 0) {
    throw new Error("No feedback found in plan-feedback.md. Add your feedback and try again.");
  }

  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are refining an existing learning plan based on user feedback.

## Instructions
Make ONLY the changes requested in the feedback below.
- Preserve everything else exactly as-is
- Keep the same markdown structure and formatting
- After making changes, re-check prerequisite ordering
- Every week header must have real dates (YYYY-MM-DD – YYYY-MM-DD)

## Current plan
${currentPlan}

## User feedback
${feedback}

## Output format
First output a change summary block:

<!-- CHANGES
- <change 1> — Reason: <why>
- <change 2> — Reason: <why>
-->

Then output the complete updated plan.
Today: ${today}`;

  const response = await plugin.llmClient.complete(
    [{ role: "user", content: prompt }],
    SYSTEM_PROMPT,
    16000
  );

  const raw = stripCodeFence(response.text);

  // Parse change summary
  const changesMatch = raw.match(/<!--\s*CHANGES\s*\n([\s\S]*?)\n-->/);
  const changes = changesMatch
    ? changesMatch[1].split("\n")
        .map(l => l.replace(/^-\s*/, "").trim())
        .filter(Boolean)
    : [];

  // Strip changes block from plan
  const planText = raw.replace(/<!--\s*CHANGES[\s\S]*?-->\s*\n?/, "").trim();

  // Write updated plan
  await app.vault.modify(planFile, planText);

  // Sync new topics to memory
  const newTopics = extractTopicsFromPlan(planText);
  const memory = await plugin.loadMemory();
  if (memory) {
    const { emptyTopic } = await import("./memory");
    let added = 0;
    for (const slug of newTopics) {
      if (!memory.topics[slug]) {
        memory.topics[slug] = emptyTopic(slug);
        memory.knowledge_graph.concept_application_count[slug] = 0;
        added++;
      }
    }
    if (added > 0) {
      memory.last_updated = today;
      await plugin.saveMemory(memory);
    }
  }

  // Show change summary modal
  new ChangeSummaryModal(app, changes).open();
}

class ChangeSummaryModal extends Modal {
  constructor(app: App, private changes: string[]) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Plan updated" });

    if (this.changes.length > 0) {
      contentEl.createEl("p", { text: "Changes applied:", cls: "meridian-section-label" });
      const list = contentEl.createEl("ul");
      for (const c of this.changes) {
        list.createEl("li", { text: c });
      }
    } else {
      contentEl.createEl("p", { text: "Plan updated (no change summary available)" });
    }

    const footer = contentEl.createDiv("meridian-footer");
    footer.createEl("button", { text: "OK", cls: "mod-cta" })
      .addEventListener("click", () => this.close());
  }

  onClose(): void { this.contentEl.empty(); }
}
