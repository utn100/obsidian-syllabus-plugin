# Meridian

**Autonomous learning agent for Obsidian** — connects what you study to what you write at work.

Meridian generates a personalised learning plan, drafts concept notes, and surfaces relevant knowledge at the moment you're writing. Daily briefs, work-learning connections, and weekly reviews come to you as push notifications — no files to remember to open.

---

## How it works

**Daily brief** → opens automatically when you launch Obsidian. Shows today's focus task, remaining resources, related notes to append to, and your language streak.

**Work-learning bridge** → save a note in your work folder. Meridian finds the most relevant concept you've studied, generates a specific 2-sentence insight, and appends it to your note. A toast appears with View and Capture buttons.

**Quick capture** → tap Capture on any connection toast, or press `Cmd+Shift+M`. Write one sentence about how the concept applies to your work. This makes future connections specific instead of generic.

**Weekly review** → opens automatically on Sunday evening. Shows what you studied, what you applied at work, and one specific recommendation for next week.

---

## Features

- ✓ Generates a week-by-week learning plan from your goals
- ✓ Drafts concept notes for all plan topics (parallel generation)
- ✓ Daily brief sidebar — auto-opens once per day
- ✓ Work-learning bridge — fires on note save with 30s debounce
- ✓ Connection toasts with View/Capture actions
- ✓ Quick capture modal (`Cmd+Shift+M`)
- ✓ Weekly review with bridge quality stats and never-applied concepts
- ✓ Streak-at-risk toast for language goals
- ✓ Inbox processing — drop any note → concept note auto-created
- ✓ Plan refinement from feedback file
- ✓ Local semantic search (OpenAI embeddings)
- ✓ Works with Anthropic, OpenAI, or Ollama

---

## Setup

1. Install and enable the plugin
2. Open Settings → Meridian
3. Choose your LLM provider and enter your API key
4. Set embedding backend to OpenAI API
5. `Cmd+P` → **Meridian: Set up learning plan**
6. Pick a template, describe your goals, set duration
7. Wait ~60 seconds while the plan and notes generate
8. The daily brief opens automatically — you're ready

---

## Commands

| Command | What it does |
|---|---|
| Set up learning plan | Opens onboarding wizard |
| Open daily brief | Opens/focuses the brief sidebar |
| Open weekly review | Generates and opens weekly review |
| Capture insight | Opens quick capture modal |
| Refine plan from feedback | Applies feedback from `plans/plan-feedback.md` |
| Sync vault notes | Re-indexes all concept notes |
| Test LLM connection | Verifies your API key works |

---

## Vault structure

The plugin creates a `meridian/` folder (configurable) in your vault:

```
meridian/
├── concepts/          ← knowledge base (agent-drafted, you enrich)
├── plans/
│   ├── learning-plan.md
│   └── plan-feedback.md
├── daily-briefs/
├── weekly-reviews/
├── work-notes/        ← write here; bridge watches this folder
├── inbox/             ← drop notes here for processing
└── memory.json        ← agent state
```

---

## Privacy

- Vault content stays local except for LLM API calls (plan generation, note drafting, connections)
- API keys stored in Obsidian's local plugin data
- No analytics, no telemetry, no external servers
- Works fully offline except for LLM calls

---

## Requirements

- Obsidian 1.4.0+
- An API key for Anthropic, OpenAI, or a running Ollama instance
- OpenAI API key for embeddings (or switch to local embeddings in settings — coming soon)

---

## Compatibility

- Desktop: macOS, Windows, Linux ✓
- Mobile: iOS, Android ✓ (requires cloud LLM provider)
