# Architecture Overview

## System Design

Home OS follows a **multi-agent architecture** where specialized agents manage distinct domains, coordinated through a shared governance model (constitution) and communicating via a common messaging layer (Telegram).

---

## Core Components

### 1. Agent Layer

Agents are the "brains" of Home OS. Each agent:
- Owns a specific domain (tasks, meals, finance, etc.)
- Has persistent memory across runs
- Operates autonomously on a schedule
- Follows constitutional rules
- Communicates via Telegram

```
┌────────────────────────────────────────────────┐
│                 AGENT LAYER                      │
├────────────────────────────────────────────────┤
│  Task Coach │ Meal Planner │ Finance Manager    │
│  Home Mgr   │ Health Coach │ Weekly Planner     │
│  Family Coord │ Daily Briefing │ Custom...      │
└────────────────────────────────────────────────┘
```

**Agent Definition Format:**
Agents are defined in Markdown files with YAML frontmatter:
```yaml
---
name: Task Coach
description: ADD-friendly productivity coach
schedule: "*/20 6-22 * * *"
priority: high
integrations: [telegram, tasks]
---

# Task Coach Agent

## Identity
You are...

## What You Do
...
```

### 2. Memory System (4-Tier)

Each agent maintains its own memory store with four tiers:

| Tier | File | Purpose | Load Strategy |
|------|------|---------|---------------|
| 1 | `core.md` | Identity, rules, preferences | Always loaded |
| 2 | `working.md` | Current context, active state | Always loaded |
| 3 | `long-term.md` | Historical patterns, lessons | On-demand |
| 4 | `events.log` | Chronological event stream | Append-only |

**Memory Rules:**
- Tier 2 is capped at 5KB — agents must trim aggressively
- Tier 3 is searched, not bulk-loaded
- Tier 4 is write-only (audit trail)
- Every correction from users must be persisted (Tier 1 or 3)

### 3. Extension Layer

Extensions provide tools that agents can call. They're standard Node.js ESM modules that export functions:

```javascript
// extensions/task-manager.mjs
export function addTask({ title, priority, due_date }) {
  // Implementation
}

export function completeTask({ id }) {
  // Implementation
}
```

Extensions are automatically registered as tools available to agents via MCP protocol.

### 4. Integration Layer

External services are connected through environment-based configuration:

```
┌─────────────────────────────────────────┐
│          INTEGRATION LAYER               │
├─────────────────────────────────────────┤
│  Telegram │ Google Calendar │ Gmail      │
│  Google Maps │ Plaid │ GitHub │ Custom   │
└─────────────────────────────────────────┘
```

Each integration:
- Has its own env config file (`config/*.env`)
- Can be enabled/disabled in `agency.toml`
- Is accessed through an extension module
- Handles its own authentication/token refresh

### 5. Scheduling System

The cron scheduler triggers agents at defined intervals:

```json
{
  "timezone": "America/Chicago",
  "jobs": [
    {
      "id": "task-coach-nudge",
      "schedule": "*/20 6-22 * * *",
      "enabled": true,
      "agent": "task-coach"
    }
  ]
}
```

Cron expressions follow standard format: `minute hour day-of-month month day-of-week`

### 6. Governance (Constitution)

The constitution is a shared document that ALL agents must follow:
- **Core Principles** — Behavioral rules (task-first, act-first, no placeholders)
- **Communication Rules** — When/how to message, quiet hours, tone
- **Autonomy Levels** — What agents can do independently vs. with permission
- **Escalation Paths** — How to handle exceptions and emergencies

---

## Data Flow

```
User (Telegram) ←→ Bot ←→ Agent (AI reasoning)
                              ↕
                    Memory (read/write)
                              ↕
                    Extensions (tools)
                              ↕
                    Integrations (APIs)
```

### Typical Agent Run:

1. **Trigger** — Cron fires or user sends message
2. **Load Memory** — Agent reads Tier 1 + Tier 2
3. **Gather Context** — Call extensions for current data
4. **Reason** — AI processes context against rules
5. **Act** — Call tools (create tasks, send messages, etc.)
6. **Persist** — Update memory tiers
7. **Communicate** — Send results via Telegram

---

## Data Storage

All data is stored as **flat files** (JSON + Markdown):

```
data/
├── constitution.md          # Governance
├── family/                  # Family profiles (JSON)
├── agents/                  # Per-agent memory (Markdown + log)
│   ├── task-coach/
│   │   ├── core.md
│   │   ├── working.md
│   │   ├── long-term.md
│   │   └── events.log
│   └── ...
├── tasks.db                 # SQLite for task queries
├── budget/                  # Financial data (JSON)
├── meals/                   # Recipes and plans (JSON)
├── shopping/                # Shopping lists (JSON)
└── home/                    # Maintenance data (JSON)
```

**Why flat files?**
- Human-readable (inspect/edit with any text editor)
- Version-controllable (git history for everything)
- No database server required
- Simple backup (copy the folder)
- Exception: SQLite for tasks (need complex queries)

---

## Security Model

- **Credentials** are stored in `config/*.env` (gitignored)
- **Tokens** are stored in `data/*.json` (gitignored)
- **No secrets in agent memory** — agents reference config, never store credentials
- **Telegram encryption** — End-to-end for bot communications
- **Self-hosted** — All data stays on your machine (no cloud required)

---

## Extensibility

### Adding a New Agent
1. Create `agents/my-agent.agent.md` with YAML frontmatter
2. Create `data/agents/my-agent/` with memory files
3. Add schedule to `cron.json`
4. Done — the system picks it up automatically

### Adding a New Extension
1. Create `extensions/my-tool.mjs` with exported functions
2. Register in MCP server config
3. Reference in agent integrations
4. Done — agents can now use your tools

### Adding a New Integration
1. Create `config/my-service.env.example`
2. Add env vars to extension code
3. Enable in `agency.toml`
4. Document in `docs/`

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Markdown agents | Human-readable, versionable, LLM-native format |
| JSON data | Simple, portable, no server needed |
| Telegram UI | Zero-friction, always-available, great formatting |
| Cron scheduling | Battle-tested, simple, no daemon needed |
| Self-hosted first | Privacy, control, no vendor lock-in |
| MCP protocol | Standard tool interface, growing ecosystem |
| 4-tier memory | Balances context window limits with persistence |
| Constitutional governance | Scales agent autonomy safely |
