#!/usr/bin/env node

/**
 * Home OS — Interactive Setup Wizard
 * 
 * Walks the user through initial configuration:
 * 1. Family member profiles
 * 2. Telegram bot setup
 * 3. Google integration (optional)
 * 4. Agent selection
 * 5. Cron schedule customization
 */

import { createInterface } from 'readline';
import { writeFileSync, mkdirSync, existsSync, copyFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'data');
const CONFIG_DIR = join(ROOT, 'config');

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(resolve => rl.question(q, resolve));

async function main() {
  console.log(`
╔══════════════════════════════════════════╗
║         🏠 Home OS Setup Wizard          ║
╚══════════════════════════════════════════╝
  `);

  console.log('Welcome to Home OS! Let\'s get your family assistant running.\n');

  // Step 1: Basic Info
  console.log('━━━ Step 1: Family Setup ━━━\n');
  const familyName = await ask('What\'s your family name? (e.g., "Smith"): ');
  const timezone = await ask('Your timezone? (e.g., "America/Chicago"): ') || 'America/Chicago';
  
  const members = [];
  let addMore = true;
  while (addMore) {
    const name = await ask('\nFamily member name: ');
    const role = await ask('Role (parent/child/other): ') || 'parent';
    const telegramId = await ask('Telegram user ID (optional, press Enter to skip): ');
    members.push({ name, role, telegram_id: telegramId || '' });
    const more = await ask('Add another family member? (y/n): ');
    addMore = more.toLowerCase() === 'y';
  }

  // Step 2: Telegram
  console.log('\n━━━ Step 2: Telegram Bot ━━━\n');
  console.log('You need a Telegram bot. Create one via @BotFather on Telegram.');
  const botToken = await ask('Telegram Bot Token: ');
  const chatId = await ask('Your Telegram Chat ID: ');

  // Step 3: Google (optional)
  console.log('\n━━━ Step 3: Google Integration (Optional) ━━━\n');
  const setupGoogle = await ask('Set up Google Calendar/Gmail? (y/n): ');
  let googleClientId = '', googleClientSecret = '', mapsKey = '';
  if (setupGoogle.toLowerCase() === 'y') {
    googleClientId = await ask('Google Client ID: ');
    googleClientSecret = await ask('Google Client Secret: ');
    mapsKey = await ask('Google Maps API Key (optional): ');
  }

  // Step 4: Write Configuration
  console.log('\n━━━ Writing Configuration ━━━\n');

  // Ensure directories
  const dirs = [
    DATA_DIR, join(DATA_DIR, 'family'), join(DATA_DIR, 'agents'),
    join(DATA_DIR, 'budget'), join(DATA_DIR, 'meals'), join(DATA_DIR, 'shopping'),
    join(DATA_DIR, 'home'), CONFIG_DIR
  ];
  dirs.forEach(d => { if (!existsSync(d)) mkdirSync(d, { recursive: true }); });

  // Write family profiles
  for (const member of members) {
    const template = JSON.parse(readFileSync(join(DATA_DIR, 'family', 'member.template.json'), 'utf-8'));
    template.name = member.name;
    template.role = member.role;
    template.telegram_id = member.telegram_id;
    const filename = member.name.toLowerCase().replace(/\s+/g, '-') + '.json';
    writeFileSync(join(DATA_DIR, 'family', filename), JSON.stringify(template, null, 2));
    console.log(`  ✅ Created profile: data/family/${filename}`);
  }

  // Write Telegram config
  writeFileSync(join(CONFIG_DIR, 'telegram.env'), `TELEGRAM_BOT_TOKEN=${botToken}\nTELEGRAM_CHAT_ID=${chatId}\n`);
  console.log('  ✅ Created: config/telegram.env');

  // Write Google config
  if (setupGoogle.toLowerCase() === 'y') {
    writeFileSync(join(CONFIG_DIR, 'google.env'), [
      `GOOGLE_CLIENT_ID=${googleClientId}`,
      `GOOGLE_CLIENT_SECRET=${googleClientSecret}`,
      `GOOGLE_MAPS_API_KEY=${mapsKey}`,
      `GOOGLE_REDIRECT_URI=http://localhost:3000/oauth/callback`
    ].join('\n') + '\n');
    console.log('  ✅ Created: config/google.env');
  }

  // Write constitution from template
  if (!existsSync(join(DATA_DIR, 'constitution.md'))) {
    let constitution = readFileSync(join(ROOT, 'templates', 'constitution.md'), 'utf-8');
    // Replace placeholders with actual family info
    const memberLines = members.map(m => `- **${m.name}** — ${m.role}${m.telegram_id ? `, Telegram: ${m.telegram_id}` : ''}`).join('\n');
    constitution = constitution.replace(/<!-- List your family members here -->[\s\S]*?<!-- Add more family members as needed -->/, memberLines);
    writeFileSync(join(DATA_DIR, 'constitution.md'), constitution);
    console.log('  ✅ Created: data/constitution.md');
  }

  // Update cron.json timezone
  const cronConfig = JSON.parse(readFileSync(join(ROOT, 'cron.json'), 'utf-8'));
  cronConfig.timezone = timezone;
  writeFileSync(join(ROOT, 'cron.json'), JSON.stringify(cronConfig, null, 2));
  console.log('  ✅ Updated: cron.json timezone');

  // Create agent memory directories
  const agents = ['daily-briefing', 'task-coach', 'meal-planner', 'finance-manager', 'home-manager', 'health-coach', 'weekly-planner', 'family-coordinator'];
  for (const agent of agents) {
    const agentDir = join(DATA_DIR, 'agents', agent);
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
      copyFileSync(join(DATA_DIR, 'agents', 'template', 'core.md'), join(agentDir, 'core.md'));
      copyFileSync(join(DATA_DIR, 'agents', 'template', 'working.md'), join(agentDir, 'working.md'));
      copyFileSync(join(DATA_DIR, 'agents', 'template', 'long-term.md'), join(agentDir, 'long-term.md'));
      copyFileSync(join(DATA_DIR, 'agents', 'template', 'events.log'), join(agentDir, 'events.log'));
    }
  }
  console.log('  ✅ Created agent memory directories');

  // Done!
  console.log(`
╔══════════════════════════════════════════╗
║         ✅ Setup Complete!               ║
╚══════════════════════════════════════════╝

Next steps:
  1. Customize your constitution: data/constitution.md
  2. Edit family profiles: data/family/*.json
  3. Test Telegram: npm run health
  4. Start the system: npm run cron

For detailed docs: docs/getting-started.md

Welcome to Home OS, ${familyName} family! 🏠
  `);

  rl.close();
}

main().catch(err => {
  console.error('Setup failed:', err.message);
  rl.close();
  process.exit(1);
});
