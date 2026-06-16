# Implementation Status

Home OS currently mixes three things in one repository:

1. **Working runtime code** for the persistent CLI/daemon system
2. **Scaffolding and templates** for the broader household platform
3. **Product vision** for features that are not fully wired end-to-end yet

This page is the quickest way to tell which is which.

## Implemented in the repository today

These areas have concrete source code under `src/` and automated coverage under `tests/`:

- **Persistent Home OS runtime** — daemon, CLI, IPC, store, and agent supervision
- **CLI phases 1-4** described in `README.md`:
  - spawn/list/stop/status flows
  - persisted messaging
  - attach/streaming
  - inspect/resume/recovery
  - history/stats/agent-to-agent messaging
- **Profile loading** from built-in definitions plus YAML files in `config/profiles/`
- **Tool profile resolution** (`file-tools`, `dev-tools`)
- **SQLite-backed local state** used by the runtime and task extension

If you want the most concrete code paths, start in:

- `src/cli/`
- `src/daemon/`
- `src/ipc/`
- `src/profiles/`
- `src/store/`
- `tests/`

## Present as scaffolding or local modules

These files exist and are useful, but they should be read as starter material rather than proof of a fully integrated product:

- `agents/*.agent.md` — agent definitions/prompts
- `templates/` — starter templates for constitutions, agents, and extensions
- `data/agents/template/` and `data/family/member.template.json` — seed data/templates
- `scripts/setup.mjs` — interactive bootstrap for local files and config
- `scripts/cron-runner.mjs` — local cron-style runner for agent markdown files
- `scripts/validate-config.mjs` and `scripts/health-check.mjs` — basic local checks
- `extensions/*.mjs` — standalone extension modules and examples
- `config/*.env.example` — example configuration files

## Aspirational or not fully represented in this repo yet

These are mentioned in the docs or product narrative, but they are not currently present as complete, documented, end-to-end functionality in this repository:

- Additional docs that were previously linked from the README but were not checked in
- A checked-in Google auth helper script (`scripts/google-auth.mjs`)
- Fully documented end-to-end setup for Telegram/Google/Plaid beyond the current examples and local checks
- The broader "AI home operating system" product vision described in marketing and go-to-market materials

## Practical reading guide

If you are evaluating the repo today:

- **For working code:** trust `src/` and `tests/`
- **For setup scaffolding:** use `scripts/`, `templates/`, `config/*.env.example`, and `agents/`
- **For vision/future direction:** use `README.md` and `docs/go-to-market.md`

## Known documentation constraints

The README describes both the implemented CLI runtime and the larger long-term Home OS vision. That makes it easy to over-read some sections as "already shipped." When in doubt, use this page as the source of truth for current repo scope.
