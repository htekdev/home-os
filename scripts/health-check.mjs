#!/usr/bin/env node

/**
 * Home OS — Health Check
 * 
 * Verifies all integrations are working and reports system status.
 * Run periodically or before debugging issues.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONFIG_DIR = join(ROOT, 'config');

async function checkTelegram() {
  const envPath = join(CONFIG_DIR, 'telegram.env');
  if (!existsSync(envPath)) return { status: 'not_configured' };

  const env = Object.fromEntries(
    readFileSync(envPath, 'utf-8').split('\n')
      .filter(l => l.includes('='))
      .map(l => l.split('=', 2))
  );

  if (!env.TELEGRAM_BOT_TOKEN) return { status: 'no_token' };

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await response.json();
    if (data.ok) {
      return { status: 'connected', bot: data.result.username };
    }
    return { status: 'error', error: data.description };
  } catch (e) {
    return { status: 'error', error: e.message };
  }
}

async function checkGoogle() {
  const tokenPath = join(ROOT, 'data', 'google-tokens.json');
  if (!existsSync(tokenPath)) return { status: 'not_configured' };

  const tokens = JSON.parse(readFileSync(tokenPath, 'utf-8'));
  const expired = tokens.expiry_date && Date.now() >= tokens.expiry_date;

  return {
    status: expired ? 'token_expired' : 'configured',
    has_refresh_token: !!tokens.refresh_token,
    expires: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'unknown'
  };
}

async function main() {
  console.log('\n🏥 Home OS Health Check\n');
  console.log('━━━ System ━━━');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${process.platform}`);
  console.log(`  Working Dir: ${ROOT}`);

  console.log('\n━━━ Integrations ━━━');

  const telegram = await checkTelegram();
  const statusIcon = { connected: '✅', not_configured: '⬜', error: '❌', no_token: '❌' };
  console.log(`  Telegram: ${statusIcon[telegram.status] || '❓'} ${telegram.status}${telegram.bot ? ` (@${telegram.bot})` : ''}${telegram.error ? ` — ${telegram.error}` : ''}`);

  const google = await checkGoogle();
  const gIcon = { configured: '✅', not_configured: '⬜', token_expired: '🟡' };
  console.log(`  Google: ${gIcon[google.status] || '❓'} ${google.status}`);

  console.log('\n━━━ Data ━━━');
  const dataChecks = [
    ['Constitution', 'data/constitution.md'],
    ['Family profiles', 'data/family'],
    ['Tasks DB', 'data/tasks.db'],
    ['Budget data', 'data/budget'],
    ['Meal plans', 'data/meals'],
    ['Shopping', 'data/shopping'],
    ['Home maintenance', 'data/home']
  ];

  for (const [name, path] of dataChecks) {
    const exists = existsSync(join(ROOT, path));
    console.log(`  ${exists ? '✅' : '⬜'} ${name}`);
  }

  console.log('\n━━━ Agents ━━━');
  const { readdirSync } = await import('fs');
  const agents = readdirSync(join(ROOT, 'agents')).filter(f => f.endsWith('.agent.md'));
  console.log(`  ${agents.length} agents defined`);
  agents.forEach(a => console.log(`    • ${a.replace('.agent.md', '')}`));

  console.log('\n');
}

main().catch(console.error);
