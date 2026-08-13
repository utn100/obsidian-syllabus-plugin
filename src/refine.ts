// Plan refinement modal — guides user to write feedback then refine

import { App, Modal, Notice, TFile } from "obsidian";
import type MeridianPlugin from "./main";
import { SYSTEM_PROMPT } from "./prompts";
import { stripCodeFence, extractTopicsFromPlan } from "./memory";

export class RefinePlanModal extends Modal {
  constructor(app: App, private plugin: MeridianPlugin) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("syllabus-onboarding");

    contentEl.createEl("h3", { text: "📝 Refine your learning plan" });

    const base = this.plugin.settings.meridianFolder;
    const feedbackPath = `${base}/plans/plan-feedback.md`;
    const feedbackFile = this.app.vault.getAbstractFileByPath(feedbackPath);

    if (!feedbackFile) {
      contentEl.createEl("p", { text: "No plan-feedback.md found. Run setup first." });
      const footer = contentEl.createDiv("syllabus-footer");
      footer.createEl("button", { text: "Close" }).addEventListener("click", () => this.close());
      return;
    }

    contentEl.createEl("p", {
      text: "Write your feedback in the file below, then click Refine. Be specific — reference week numbers or topic names.",
      cls: "syllabus-hint",
    });

    contentEl.createEl("p", {
      text: "Examples:",
      cls: "syllabus-section-label",
    });

    const examples = contentEl.createEl("ul");
    examples.createEl("li", { text: "Week 3 is too dense — split across two weeks" });
    examples.createEl("li", { text: "Move RLHF earlier, it's directly relevant to my current work" });
    examples.createEl("li", { text: "Add a week on causal inference after week 8" });

    // Open feedback file button
    const openBtn = contentEl.createEl("button", {
      text: "Open plan-feedback.md →",
      cls: "mod-cta",
    });
    openBtn.style.marginTop = "12px";
    openBtn.addEventListener("click", async () => {
      if (feedbackFile instanceof TFile) {
        await this.app.workspace.getLeaf(false).openFile(feedbackFile);
      }
    });

    contentEl.createEl("hr");
    contentEl.createEl("p", {
      text: "Once you've added your feedback, click Refine. The file is re-read at click time — you can dismiss this modal, edit, then reopen it.",
      cls: "syllabus-hint",
    });

    const progressEl = contentEl.createDiv("syllabus-progress");
    progressEl.hide();

    const footer = contentEl.createDiv("syllabus-footer");

    const cancelBtn = footer.createEl("button", { text: "Cancel" });
    cancelBtn.addEventListener("click", () => this.close());

    const refineBtn = footer.createEl("button", { text: "Refine plan", cls: "mod-cta" });
    refineBtn.addEventListener("click", async () => {
      refineBtn.disabled = true;
      refineBtn.setText("Refining...");
      progressEl.show();
      progressEl.setText("⏳ Applying feedback to your plan...");

      try {
        const changes = await runRefinePlan(this.app, this.plugin);
        this.close();

        // Show change summary
        new ChangeSummaryModal(this.app, changes).open();
      } catch (e) {
        progressEl.setText(`Error: ${(e as Error).message}`);
        refineBtn.disabled = false;
        refineBtn.setText("Retry");
      }
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

class ChangeSummaryModal extends Modal {
  constructor(app: App, private changes: string[]) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "✓ Plan updated" });

    if (this.changes.length > 0) {
      contentEl.createEl("p", { text: "Changes applied:", cls: "syllabus-section-label" });
      const list = contentEl.createEl("ul");
      for (const c of this.changes) {
        list.createEl("li", { text: c });
      }
    } else {
      contentEl.createEl("p", { text: "Plan updated successfully." });
    }

    const footer = contentEl.createDiv("syllabus-footer");
    footer.createEl("button", { text: "Done", cls: "mod-cta" })
      .addEventListener("click", () => this.close());
  }

  onClose(): void { this.contentEl.empty(); }
}

// ── Core refinement logic ──────────────────────────────────────────────────

export async function runRefinePlan(
  app: App,
  plugin: MeridianPlugin
): Promise<string[]> {
  const base = plugin.settings.meridianFolder;
  const planPath = `${base}/plans/learning-plan.md`;
  const feedbackPath = `${base}/plans/plan-feedback.md`;

  const planFile = app.vault.getAbstractFileByPath(planPath);
  if (!(planFile instanceof TFile)) {
    throw new Error("No learning-plan.md found. Run setup first.");
  }

  const feedbackFile = app.vault.getAbstractFileByPath(feedbackPath);
  if (!(feedbackFile instanceof TFile)) {
    throw new Error("No plan-feedback.md found.");
  }

  const currentPlan = await app.vault.read(planFile);
  const feedback = await app.vault.read(feedbackFile);

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

  const changesMatch = raw.match(/<!--\s*CHANGES\s*\n([\s\S]*?)\n-->/);
  const changes = changesMatch
    ? changesMatch[1].split("\n")
        .map(l => l.replace(/^-\s*/, "").trim())
        .filter(Boolean)
    : [];

  const planText = raw
    .replace(/<!--\s*CHANGES[\s\S]*?-->\s*\n?/, "")
    .replace(/^-{3,}\s*\n(?=---)/, "") // remove spurious leading ---
    .trim();
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

  return changes;
}
