// Prompts — ported from Python agent/nodes/plan.py and agent/nodes/draft.py

export const SYSTEM_PROMPT = `You are Meridian, an expert learning coach for busy professionals.
You design rigorous, realistic learning plans that respect time constraints,
prerequisite dependencies, and the user's existing knowledge level.

You have deep knowledge of the best learning resources for DS/ML, RL, agent building,
and language learning. When recommending resources, be specific: name the exact book,
chapter, blog post, YouTube channel, or paper. Prefer free or low-cost resources.
Prioritise resources that are practical, well-regarded, and concise.`;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function buildPlanPrompt(params: {
  context: string;
  goals: string;
  constraints: string;
  currentLevel: string;
  hoursPerWeek: number;
  startDate: string;
  endDate: string;
  durationWeeks: number;
  today: string;
  languageGoal?: string;
  alreadyStudied?: string[];
}): string {
  const studiedSection =
    params.alreadyStudied && params.alreadyStudied.length > 0
      ? `\n## Already studied (do not re-plan these)\n${params.alreadyStudied.map((t) => `- ${t}`).join("\n")}\n`
      : "";

  const languageInstructions = params.languageGoal
    ? `- Include a Theme for language learning: "${params.languageGoal}"
   - Add language topics to the Topics by theme section
   - Every week must have a language checkbox task`
    : `- Do NOT include any language learning section — the user has no language goal
   - Do not add language checkboxes to weekly tasks`;

  const week1End = addDays(params.startDate, 6);

  return `Design a learning plan for the following profile.

## Background context
${params.context}

## Goals
${params.goals}

## Constraints
${params.constraints}

## Current level
${params.currentLevel}

## Instructions

Create a CONCISE week-by-week plan with specific resource recommendations per week.

### Required sections

1. **Sequencing rationale** — 2-3 sentences explaining the ordering logic.

2. **Resource library** — master list grouped by theme. For each resource: title, author/source, format, free/paid, why recommended.

3. **Topics by theme** — list all topics grouped by theme with prerequisites.
   Use this exact format per topic:
   - **[ID]. [Topic name]** — prerequisites: [comma list or "none"]
   Example: - **1.1. Python for DS** — prerequisites: none

4. **Daily schedule template** — how to split ${params.hoursPerWeek} hrs/week.

5. **Week-by-week schedule** — ALL ${params.durationWeeks} weeks, CONCISE format.
   Each week MUST use this exact header format with real dates:
   ### Week N (YYYY-MM-DD – YYYY-MM-DD) — Theme name
   Each week must have:
   - A **📚 Resources**: line naming the specific resource(s)
   - 3-4 checkbox tasks referencing the resource
   Keep each week under 10 lines total.

## Language goal
${languageInstructions}

## Critical requirements
- MUST include ALL ${params.durationWeeks} weeks — do not stop early
- Every week header MUST have real start and end dates (YYYY-MM-DD – YYYY-MM-DD)
- Tasks must be specific enough to act on immediately

## Output format (Obsidian markdown)

---
tags: [learning-plan, meridian]
created: ${params.today}
---

# Learning Plan
**Period**: ${params.startDate} → ${params.endDate} | **Budget**: ${params.hoursPerWeek} hrs/week

## Sequencing rationale
[2-3 sentences]

## Resource library
[tables by theme]

## Topics by theme
[topic list]

## Daily schedule template
[schedule]

## Week-by-week schedule

### Week 1 (${params.startDate} – ${week1End}) — [Theme]
📚 **Resources**: [specific resources]
- [ ] [Specific task — time estimate]
- [ ] [Specific task]
- [ ] [Specific task]

[continue EVERY week through week ${params.durationWeeks} with real dates]
${studiedSection}`;
}

export function buildDraftPrompt(params: {
  topic: string;
  knownTopics: string[];
  userRole: string;
  context: string;
}): string {
  return `Draft a concept note for the topic: "${params.topic}"

## User background
${params.context}

## Known topics (use for prerequisites and related links)
${params.knownTopics.slice(0, 30).join(", ")}

## Output format (Obsidian markdown, exactly this structure)

---
tags: [concept, draft]
status: draft
prerequisites: [comma-separated slugs from known topics, or empty]
related: [comma-separated slugs from known topics, or empty]
so_what_filled: false
confidence: 0
connections: 0
last_reviewed: null
last_applied: null
---

# [Topic name]

## What it is
[2-3 sentences — core definition]

## How it works
[Mechanism, key concepts, simple explanation]

## Example
[Concrete example relevant to ${params.userRole} work context]

## So what for ${params.userRole}
*<- Yours. One sentence on how this applies to your work. Fill this in after studying.*

## Related
[[[slug1]], [[slug2]] — links to related concept notes]

## Rules
- So what section must contain ONLY the italic placeholder line above — never fill it in
- prerequisites and related must only use slugs from the known topics list
- Keep each section concise — this is a stub for the user to enrich
- Use lowercase-hyphenated slugs in frontmatter (e.g. markov-decision-processes)`;
}
