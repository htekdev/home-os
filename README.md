<div align="center">

# 🏠 Home OS

### The AI-Powered Home Assistant Platform

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![GitHub Stars](https://img.shields.io/github/stars/htekdev/home-os?style=social)](https://github.com/htekdev/home-os)
[![Built with Copilot CLI](https://img.shields.io/badge/Built%20with-Copilot%20CLI-blue)](https://githubnext.com/projects/copilot-cli)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-339933?logo=nodedotjs)](https://nodejs.org)

**A multi-agent AI system that runs your household — tasks, meals, finances, health, maintenance, and more.**

[🌐 Website](https://htekdev.github.io/home-os-site) · [📖 Docs](./docs/) · [🚀 Get Started](#-quick-start) · [💬 Community](https://github.com/htekdev/home-os/discussions)

</div>

---

## What is Home OS?

Home OS is an **autonomous multi-agent platform** that manages your household like a well-oiled machine. It's not another smart home hub or IoT controller — it's a **thinking system** that proactively manages your family's daily life.

Think of it as hiring a team of AI specialists:
- 🧠 A **productivity coach** that serves you one task at a time (ADD-friendly)
- 🍽️ A **meal planner** that knows your dietary needs and generates grocery lists
- 💰 A **finance manager** that tracks spending and alerts you about bills
- 🏥 A **health coach** that manages appointments and medications
- 🏡 A **home manager** that tracks maintenance schedules
- 📅 A **family coordinator** that handles logistics and scheduling
- ☀️ A **daily briefing** agent that starts your morning with everything you need to know

Each agent runs autonomously on a schedule, communicates via Telegram, and learns your family's patterns over time.

---

## ⚡ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HOME OS PLATFORM                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Task      │  │   Meal      │  │  Finance    │   ...more    │
│  │   Coach     │  │   Planner   │  │  Manager    │   agents     │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                 │                 │                     │
│  ┌──────┴─────────────────┴─────────────────┴──────────────┐    │
│  │              🧠 MEMORY SYSTEM (4-Tier)                   │    │
│  │  ┌────────┐ ┌──────────┐ ┌───────────┐ ┌────────────┐  │    │
│  │  │ Core   │ │ Working  │ │ Long-term │ │ Event Log  │  │    │
│  │  │ (T1)   │ │ (T2)     │ │ (T3)      │ │ (T4)       │  │    │
│  │  └────────┘ └──────────┘ └───────────┘ └────────────┘  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              🔧 EXTENSION LAYER                          │    │
│  │  Tasks │ Shopping │ Meals │ Budget │ Calendar │ Maps    │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              📡 INTEGRATION LAYER                        │    │
│  │  Telegram │ Google Cal │ Gmail │ Plaid │ Maps │ More   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              ⏰ CRON SCHEDULER                           │    │
│  │  Heartbeat │ Nudges │ Briefings │ Reviews │ Checks     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              📜 CONSTITUTION & GOVERNANCE                │    │
│  │  Core Principles │ Autonomy Levels │ Communication     │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
├─────────────────────────────────────────────────────────────────┤
│  🤖 BACKBONE: GitHub Copilot CLI + MCP Servers                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Features

### 🧠 Multi-Agent Intelligence
Each domain has its own specialist agent with persistent memory. Agents don't just respond — they **proactively anticipate** needs and generate tasks before you ask.

### 📱 Telegram-First Interface
Your home runs through Telegram. Get briefings, receive nudges, mark tasks complete, and interact with your agents — all from your phone.

### 🧩 4-Tier Memory Architecture
Agents remember everything:
- **Tier 1 (Core):** Identity, rules, preferences — always loaded
- **Tier 2 (Working):** Today's context, active state — always loaded
- **Tier 3 (Long-term):** Historical patterns, lessons — on-demand
- **Tier 4 (Events):** Chronological log — append-only audit trail

### ⏰ Autonomous Scheduling
Agents run on cron schedules without human intervention. Morning briefings, task nudges, meal planning, budget reviews — all automated.

### 📜 Constitutional Governance
A shared constitution defines how agents behave, communicate, and make decisions. Autonomy levels prevent runaway actions while keeping the system responsive.

### 🔌 Extensible Everything
Add new integrations, agents, or tools without touching core code. The extension system uses standard Node.js ESM modules.

### 👨‍👩‍👧‍👦 Family-First Design
Built for real families with real needs: dietary restrictions, school schedules, medical appointments, budget constraints, and the chaos of daily life.

---

## 🚀 Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org)
- [GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli) (with active subscription)
- [Telegram Bot](https://t.me/BotFather) (for notifications)
- Optional: Google Cloud credentials (Calendar, Gmail, Maps)
- Optional: Plaid credentials (banking integration)

### Installation

```bash
# Clone the repository
git clone https://github.com/htekdev/home-os.git
cd home-os

# Run the interactive setup wizard
npm run setup

# Or manually configure:
cp config/telegram.env.example config/telegram.env
cp config/google.env.example config/google.env

# Edit your configuration
# See docs/getting-started.md for detailed setup
```

### First Run

```bash
# Validate your configuration
npm run validate

# Start the cron scheduler
npm run cron

# Or run a specific agent manually
copilot-cli run agents/daily-briefing.agent.md
```

### Home OS CLI (Phase 1)

The first Home OS CLI iteration adds a standalone daemon + CLI for persistent Copilot SDK sessions.

```bash
# Install dependencies and build the CLI
npm install
npm run build

# Start the daemon
node ./bin/home-os.js start

# Spawn a persistent agent session
node ./bin/home-os.js spawn home-assistant

# Inspect the tracked agents
node ./bin/home-os.js list
node ./bin/home-os.js logs home-assistant --limit 5

# Stop the daemon when done
node ./bin/home-os.js stop-daemon
```

### Home OS CLI (Phase 2)

Phase 2 expands the runtime with message persistence, live streaming, inspect, and daemon recovery.

```bash
# Send a message to an agent — persisted and dispatched
node ./bin/home-os.js send home-assistant "What's on the calendar today?"

# Attach to an agent — replays recent output then streams live events
node ./bin/home-os.js attach home-assistant
# Use --no-replay to skip history, --replay-limit 5 to limit

# Inspect full metadata for an agent
node ./bin/home-os.js inspect home-assistant

# Resume an orphaned/persisted agent after daemon restart
node ./bin/home-os.js resume home-assistant
```

Key Phase 2 behaviors:
- **send** — persists inbound message to SQLite, dispatches to SDK session, returns response
- **attach** — SSE stream replaying recent output, then live-tailing all events
- **inspect** — shows full agent metadata (profile, tools, session ID, loaded state, message count)
- **resume** — reloads an orphaned agent that persists in SQLite but isn't loaded in memory
- **Daemon recovery** — on startup, daemon auto-resumes all active/idle/orphaned agents
- **Graceful shutdown** — marks agents as `orphaned` (not `stopped`) so they can be recovered

### Home OS CLI (Phase 3)

Phase 3 adds tool registration, bootstrap prompts, streaming, YAML profiles, and error recovery.

```bash
# List agents with table formatting and filters
node ./bin/home-os.js list --active
node ./bin/home-os.js list --stopped
node ./bin/home-os.js list --status error

# Streaming send — response chunks arrive in real-time
node ./bin/home-os.js send home-assistant "Analyze this data" --stream

# Spawn a YAML-defined profile (from config/profiles/*.yaml)
node ./bin/home-os.js spawn coding-assistant --label my-dev

# Inspect shows resolved tools
node ./bin/home-os.js inspect home-assistant
```

Key Phase 3 behaviors:
- **Bootstrap prompts** — after spawn, the profile's `bootstrapPrompt` is automatically sent; response persisted
- **Tool registration** — profiles declare `baseTools` (view/glob/grep/shell or groups like `file-tools`/`dev-tools`); resolved and registered with SDK sessions
- **Streaming send** — `--stream` flag streams response chunks via SSE as they arrive
- **YAML profiles** — place `*.yaml` files in `config/profiles/` to define custom profiles without code changes
- **Error recovery** — if `sendToAgent` fails, agent is marked `error` status with the error recorded (visible in `inspect`)
- **Tool execution events** — `tool_execution_start/end` events are persisted and forwarded to attach subscribers
- **Improved list** — table formatting, ANSI status colors, `--active`/`--stopped`/`--status` filters

Built-in profiles:
- `home-assistant` (file-tools)
- `nicu-care` (file-tools)
- `platform-manager` (dev-tools)

YAML-defined profiles (config/profiles/):
- `coding-assistant` (dev-tools)

### Home OS CLI (Phase 4)

Phase 4 adds agent-to-agent messaging, conversation history, metrics, hot-reload profiles, enhanced health checks, and configuration validation.

```bash
# Show full conversation history for an agent
node ./bin/home-os.js history home-assistant
node ./bin/home-os.js history home-assistant --limit 50

# View agent metrics/statistics
node ./bin/home-os.js stats home-assistant

# Send a message between agents (agent-to-agent IPC)
node ./bin/home-os.js message home-assistant nicu-care "Check pumping schedule"

# Detailed health check with per-agent status
curl http://127.0.0.1:44123/health?detailed=true
```

Key Phase 4 behaviors:
- **Agent-to-agent messaging** — agents can send messages to each other via `sendAgentMessage`; delivered as system prompts to target sessions, queued if target is offline
- **Conversation history** — `home-os history <agent>` shows full chronological conversation with colored roles and timestamps
- **Agent metrics** — `home-os stats <agent>` shows uptime, message counts (in/out), tool call count, and estimated memory usage
- **Hot-reload profiles** — daemon watches `config/profiles/` for YAML changes; profiles are reloaded automatically without restart
- **Enhanced health endpoint** — `?detailed=true` on `/health` returns per-agent health info (status, memory, message count, last error)
- **Configuration validation** — YAML profiles are validated against schema on load; clear error messages for invalid fields, bad names, unknown tools, malformed MCP configs
- **MCP server config** — profiles can declare `mcpServers` array with name, command, args, env for MCP integration
- **50 tests passing** (target was 40+)

### Customize for Your Family

1. **Edit `data/constitution.md`** — Set your family's rules and preferences
2. **Add family profiles** in `data/family/` — Name, dietary needs, schedules
3. **Customize agents** in `agents/` — Enable/disable, adjust personalities
4. **Configure cron schedules** in `cron.json` — Match your family's rhythm
5. **Add integrations** in `config/` — Connect services you use

---

## 📁 Project Structure

```
home-os/
├── agency.toml              # System-wide configuration
├── cron.json                # Scheduling definitions
├── agents/                  # Agent definitions (Markdown + YAML frontmatter)
│   ├── daily-briefing.agent.md
│   ├── task-coach.agent.md
│   ├── meal-planner.agent.md
│   ├── finance-manager.agent.md
│   ├── home-manager.agent.md
│   ├── health-coach.agent.md
│   ├── weekly-planner.agent.md
│   └── family-coordinator.agent.md
├── extensions/              # Tool integrations (Node.js ESM)
│   ├── task-manager.mjs
│   ├── shopping-list.mjs
│   ├── meal-planner.mjs
│   ├── budget-tracker.mjs
│   ├── home-maintenance.mjs
│   ├── telegram-bridge.mjs
│   └── google-integration.mjs
├── data/                    # Persistent data store
│   ├── constitution.md      # Governance document
│   ├── family/              # Family member profiles
│   ├── agents/              # Agent memory (4-tier per agent)
│   └── examples/            # Example configurations
├── config/                  # Service credentials (gitignored)
│   ├── telegram.env.example
│   ├── google.env.example
│   └── plaid.env.example
├── docs/                    # Comprehensive documentation
│   ├── getting-started.md
│   ├── architecture.md
│   ├── agents-guide.md
│   ├── memory-system.md
│   └── go-to-market.md
├── scripts/                 # Utility scripts
│   ├── setup.mjs
│   ├── validate-config.mjs
│   ├── cron-runner.mjs
│   └── health-check.mjs
└── templates/               # Starter templates
    ├── constitution.md
    ├── agent.md
    └── extension.mjs
```

---

## 🧩 Built-In Agents

| Agent | Domain | Schedule | Description |
|-------|--------|----------|-------------|
| 🌅 Daily Briefing | Morning routine | 6 AM weekdays | Weather, calendar, tasks, priorities |
| 🎯 Task Coach | Productivity | Every 20 min | ADD-friendly one-at-a-time task delivery |
| 🍽️ Meal Planner | Nutrition | Sat 10 AM | Weekly meals, recipes, grocery lists |
| 💰 Finance Manager | Budget | 1st of month | Spending review, bill alerts, categorization |
| 🏡 Home Manager | Maintenance | Mon 8 AM | Repair schedules, service providers |
| 🏥 Health Coach | Medical | Daily 9 AM | Appointments, medications, wellness |
| 📅 Weekly Planner | Planning | Sun 7 PM | Full week overview and preparation |
| 👨‍👩‍👧 Family Coordinator | Logistics | Weekday 7 AM | Activities, carpool, events |

---

## 🔌 Integrations

| Service | Purpose | Status |
|---------|---------|--------|
| Telegram | Primary UI & notifications | ✅ Core |
| Google Calendar | Event management | ✅ Core |
| Gmail | Email triage & alerts | ✅ Core |
| Google Maps | Drive times & routing | ✅ Core |
| Plaid | Banking & transactions | 🔧 Optional |
| GitHub | Issue tracking & automation | 🔧 Optional |

---

## 💡 Design Philosophy

### Task-First System
Every actionable insight becomes a task. The system doesn't just inform — it creates trackable, completable work items. This is especially powerful for ADHD/ADD users who need external structure.

### Act First, Report After
Agents are autonomous. They detect situations, take action, and then notify you. No "would you like me to...?" — just results.

### Proactive Intelligence
Agents don't wait to be asked. Doctor appointment tomorrow? The system generates prep tasks: grab insurance cards, leave-by time, pack snacks for the kids. Guest coming over? Clean house tasks appear automatically.

### No Placeholders
Every agent, every extension, every configuration is complete and working. This isn't a skeleton — it's a production system.

---

## 📚 Documentation

- [Getting Started Guide](docs/getting-started.md) — Full setup walkthrough
- [Architecture Overview](docs/architecture.md) — How the system works
- [Agent Development Guide](docs/agents-guide.md) — Create custom agents
- [Memory System](docs/memory-system.md) — Understanding the 4-tier architecture
- [Extension Development](docs/extensions-guide.md) — Build new integrations
- [Telegram Setup](docs/telegram-setup.md) — Configure your bot
- [Google Integration](docs/google-integration.md) — Calendar, Gmail, Maps
- [Cron Scheduling](docs/cron-scheduling.md) — Automate agent execution
- [Customization Guide](docs/customization.md) — Make it yours
- [Go-to-Market Strategy](docs/go-to-market.md) — Business plan & pricing

---

## 🏗️ Built With

- **[GitHub Copilot CLI](https://githubnext.com/projects/copilot-cli)** — AI backbone for all agent reasoning
- **[MCP Servers](https://modelcontextprotocol.io)** — Tool integration protocol
- **[Node.js](https://nodejs.org)** — Runtime for extensions and scripting
- **[Telegram Bot API](https://core.telegram.org/bots/api)** — Primary user interface
- **[Google APIs](https://developers.google.com)** — Calendar, Gmail, Maps
- **[Plaid](https://plaid.com)** — Banking and financial data

---

## 🤝 Contributing

Home OS is open source and welcomes contributions! See our [Contributing Guide](CONTRIBUTING.md) for details.

Areas where we'd love help:
- New agent templates (pet care, garden, fitness, education)
- Additional integrations (Alexa, HomeKit, IFTTT)
- UI improvements (web dashboard, mobile app)
- Documentation and tutorials
- Internationalization

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details. Use it, fork it, build on it.

---

## 🌟 Star History

If Home OS helps your family, give us a ⭐ on GitHub!

---

<div align="center">

**Built with ❤️ for families who deserve a smarter home.**

[⭐ Star on GitHub](https://github.com/htekdev/home-os) · [🌐 Visit Website](https://htekdev.github.io/home-os-site) · [📖 Read the Docs](./docs/)

</div>
