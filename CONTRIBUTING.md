# Contributing to Home OS

Thank you for your interest in contributing to Home OS! We welcome contributions of all kinds.

## Ways to Contribute

### 🐛 Bug Reports
- Use [GitHub Issues](https://github.com/htekdev/home-os/issues) to report bugs
- Include: steps to reproduce, expected behavior, actual behavior
- Include your Node.js version, OS, and relevant configuration

### 💡 Feature Requests
- Open a [Discussion](https://github.com/htekdev/home-os/discussions) first
- Describe the use case, not just the solution
- Consider how it fits into the existing architecture

### 🧩 New Agents
We'd love more agent templates! Great candidates:
- **Pet Care** — Feeding schedules, vet appointments, medication
- **Garden/Plants** — Watering schedules, seasonal planting
- **Fitness** — Workout plans, progress tracking, recovery
- **Education** — Homework tracking, lesson plans, reading logs
- **Social** — Birthday reminders, gift ideas, event planning
- **Travel** — Trip planning, packing lists, itinerary management

### 🔌 New Extensions
Integrations with:
- Smart home platforms (HomeKit, Z-Wave, Zigbee)
- Fitness trackers (Fitbit, Apple Health, Garmin)
- Music services (Spotify for mood-based playlists)
- Weather APIs (for outfit and activity suggestions)
- Grocery delivery (Instacart, Amazon Fresh)

### 📖 Documentation
- Tutorials and how-to guides
- Video walkthroughs
- Internationalization (translations)
- FAQ and troubleshooting

## Development Setup

```bash
git clone https://github.com/htekdev/home-os.git
cd home-os
npm install
npm run validate
```

## Code Style

- **Extensions:** ESM modules, camelCase exports, JSDoc comments
- **Agents:** Markdown with YAML frontmatter, clear section headers
- **Data:** JSON for structured data, Markdown for prose
- **No dependencies without justification** — keep it lean

## Pull Request Process

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Test: `npm run validate`
5. Commit with clear message: `feat: add pet-care agent template`
6. Push and open a PR
7. Describe what, why, and how to test

## Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
