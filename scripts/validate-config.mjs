#!/usr/bin/env node

/**
 * Home OS — Configuration Validator
 * 
 * Checks that all required configuration is in place and valid.
 * Run before starting the cron system to catch issues early.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const checks = [];
let errors = 0;
let warnings = 0;

function pass(msg) { checks.push(`  ✅ ${msg}`); }
function fail(msg) { checks.push(`  ❌ ${msg}`); errors++; }
function warn(msg) { checks.push(`  ⚠️  ${msg}`); warnings++; }

console.log('\n🔍 Home OS Configuration Validator\n');

// Check core files
console.log('━━━ Core Files ━━━');
const coreFiles = ['agency.toml', 'cron.json', 'package.json'];
for (const file of coreFiles) {
  if (existsSync(join(ROOT, file))) {
    pass(`${file} exists`);
  } else {
    fail(`${file} missing`);
  }
}

// Check data directory
console.log('\n━━━ Data Directory ━━━');
const dataFiles = ['data/constitution.md', 'data/family'];
for (const file of dataFiles) {
  if (existsSync(join(ROOT, file))) {
    pass(`${file} exists`);
  } else {
    warn(`${file} missing — run 'npm run setup'`);
  }
}

// Check Telegram config
console.log('\n━━━ Telegram ━━━');
const telegramEnv = join(ROOT, 'config', 'telegram.env');
if (existsSync(telegramEnv)) {
  const content = readFileSync(telegramEnv, 'utf-8');
  if (content.includes('TELEGRAM_BOT_TOKEN=') && !content.includes('TELEGRAM_BOT_TOKEN=\n')) {
    pass('Telegram bot token configured');
  } else {
    fail('Telegram bot token is empty');
  }
  if (content.includes('TELEGRAM_CHAT_ID=') && !content.includes('TELEGRAM_CHAT_ID=\n')) {
    pass('Telegram chat ID configured');
  } else {
    fail('Telegram chat ID is empty');
  }
} else {
  fail('config/telegram.env missing — run setup or copy from telegram.env.example');
}

// Check Google config (optional)
console.log('\n━━━ Google Integration (Optional) ━━━');
const googleEnv = join(ROOT, 'config', 'google.env');
if (existsSync(googleEnv)) {
  const content = readFileSync(googleEnv, 'utf-8');
  if (content.includes('GOOGLE_CLIENT_ID=') && !content.includes('GOOGLE_CLIENT_ID=\n')) {
    pass('Google Client ID configured');
  } else {
    warn('Google Client ID empty');
  }
} else {
  warn('Google not configured (optional) — see docs/google-integration.md');
}

// Check cron.json validity
console.log('\n━━━ Cron Configuration ━━━');
try {
  const cron = JSON.parse(readFileSync(join(ROOT, 'cron.json'), 'utf-8'));
  if (cron.timezone) {
    pass(`Timezone: ${cron.timezone}`);
  } else {
    warn('No timezone set in cron.json');
  }
  if (cron.jobs && cron.jobs.length > 0) {
    const enabled = cron.jobs.filter(j => j.enabled).length;
    pass(`${cron.jobs.length} jobs defined (${enabled} enabled)`);
  } else {
    warn('No cron jobs defined');
  }
} catch (e) {
  fail(`cron.json parse error: ${e.message}`);
}

// Check agents
console.log('\n━━━ Agents ━━━');
const agentsDir = join(ROOT, 'agents');
if (existsSync(agentsDir)) {
  const { readdirSync } = await import('fs');
  const agents = readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
  pass(`${agents.length} agent definitions found`);
} else {
  fail('agents/ directory missing');
}

// Summary
console.log('\n━━━ Summary ━━━');
checks.forEach(c => console.log(c));
console.log(`\n  Results: ${checks.length - errors - warnings} passed, ${warnings} warnings, ${errors} errors`);

if (errors > 0) {
  console.log('\n  ❌ Fix errors above before running Home OS.\n');
  process.exit(1);
} else if (warnings > 0) {
  console.log('\n  ⚠️  Warnings present — system will work but some features may be limited.\n');
} else {
  console.log('\n  ✅ All checks passed! Ready to run: npm run cron\n');
}
