# Getting Started with Home OS

## Overview

Home OS is a multi-agent AI platform that manages your household autonomously. This guide walks you through setup from zero to a running system.

**Time to complete:** 30-60 minutes for basic setup, 2-3 hours for full customization.

---

## Prerequisites

### Required
1. **Node.js 20+** — [Download](https://nodejs.org)
2. **GitHub Copilot CLI** — [Install Guide](https://githubnext.com/projects/copilot-cli)
   - Requires GitHub Copilot subscription ($10/mo or $100/yr)
3. **Telegram Account** — [Download Telegram](https://telegram.org)
4. **Git** — For cloning and version control

### Optional (but recommended)
5. **Google Cloud Project** — For Calendar, Gmail, and Maps
6. **Plaid Account** — For banking integration (Developer tier is free)

---

## Step 1: Clone and Install

```bash
git clone https://github.com/htekdev/home-os.git
cd home-os
npm install
```

---

## Step 2: Create Your Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name (e.g., "Rocha Home") and username (e.g., "rocha_home_bot")
4. BotFather gives you a **token** — save it!
5. Start a chat with your new bot and send any message
6. Get your **chat_id**:
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates"
   ```
   Look for `"chat":{"id":123456789}` — that's your chat_id.

---

## Step 3: Configure Environment

```bash
cp config/telegram.env.example config/telegram.env
```

Edit `config/telegram.env`:
```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

---

## Step 4: Set Up Family Profiles

Create a profile for each family member in `data/family/`:

```bash
cp data/family/member.template.json data/family/dad.json
```

Edit `data/family/dad.json`:
```json
{
  "name": "John",
  "role": "parent",
  "telegram_id": "123456789",
  "dietary": {
    "preferences": ["high-protein", "low-carb"],
    "allergies": ["shellfish"],
    "dislikes": ["mushrooms"]
  },
  "medical": {
    "pharmacy": "CVS on Main St",
    "doctor": "Dr. Smith",
    "medications": [
      { "name": "Vitamin D", "dosage": "5000 IU", "frequency": "daily" }
    ]
  },
  "schedule": {
    "wake_time": "6:00 AM",
    "work_start": "8:00 AM",
    "work_end": "5:00 PM",
    "bed_time": "10:30 PM"
  }
}
```

---

## Step 5: Write Your Constitution

The constitution is the governance document that controls how ALL agents behave. Copy the template and customize:

```bash
cp templates/constitution.md data/constitution.md
```

Key sections to customize:
- **Who We Are** — Family members and roles
- **Core Principles** — What matters to your family
- **Communication Rules** — When/how agents should communicate
- **Autonomy Levels** — What agents can do without asking

---

## Step 6: Configure Agents

Review the agents in `agents/` and customize:
- Enable/disable agents by editing `cron.json`
- Adjust schedules to match your family's rhythm
- Modify agent personalities in their `.agent.md` files

---

## Step 7: Set Up Cron Scheduling

Edit `cron.json` to match your timezone and preferences:

```json
{
  "timezone": "America/Chicago",
  "jobs": [
    {
      "id": "morning-briefing",
      "schedule": "0 6 * * 1-5",
      "enabled": true,
      "agent": "daily-briefing"
    }
  ]
}
```

Start the scheduler:
```bash
npm run cron
```

---

## Step 8: Validate Configuration

```bash
npm run validate
```

This checks:
- All required environment variables are set
- Telegram bot is reachable
- Google tokens are valid (if configured)
- Agent files are properly formatted
- Cron schedules are valid

---

## Step 9: Run Your First Agent

Test an agent manually:
```bash
copilot-cli run agents/daily-briefing.agent.md
```

You should receive a briefing in your Telegram chat!

---

## Optional: Google Integration

### Google Calendar & Gmail

1. Create a project at [Google Cloud Console](https://console.cloud.google.com)
2. Enable Calendar API and Gmail API
3. Create OAuth2 credentials (Desktop app type)
4. Download the credentials JSON

```bash
cp config/google.env.example config/google.env
```

Edit with your credentials:
```env
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback
```

Run the auth flow:
```bash
node scripts/google-auth.mjs
```

### Google Maps

1. Enable Directions API and Distance Matrix API in Google Cloud
2. Create an API key
3. Add to `config/google.env`:
```env
GOOGLE_MAPS_API_KEY=your_maps_key
```

---

## Optional: Banking Integration (Plaid)

1. Sign up at [Plaid Dashboard](https://dashboard.plaid.com)
2. Get your API keys (use Sandbox for testing)
3. Configure in `config/plaid.env`:
```env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_secret
PLAID_ENV=sandbox
```

---

## Next Steps

1. **Read the [Architecture Guide](architecture.md)** — Understand how the system works
2. **Customize agents** — See [Agent Development Guide](agents-guide.md)
3. **Build extensions** — See [Extension Guide](extensions-guide.md)
4. **Join the community** — [GitHub Discussions](https://github.com/htekdev/home-os/discussions)

---

## Troubleshooting

### Telegram bot not responding
- Verify token with: `curl https://api.telegram.org/bot<TOKEN>/getMe`
- Ensure you've started a chat with the bot
- Check chat_id is correct

### Google auth failing
- Ensure redirect URI matches exactly
- Check that APIs are enabled in Cloud Console
- Try deleting `data/google-tokens.json` and re-authenticating

### Agents not running on schedule
- Verify `npm run cron` is running
- Check timezone in `cron.json` matches your system
- Validate cron expressions at [crontab.guru](https://crontab.guru)

### Need help?
- [GitHub Issues](https://github.com/htekdev/home-os/issues)
- [GitHub Discussions](https://github.com/htekdev/home-os/discussions)
