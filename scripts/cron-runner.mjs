#!/usr/bin/env node

/**
 * Home OS — Cron Runner
 * 
 * Reads cron.json and executes agents on their defined schedules.
 * Uses node-cron for scheduling and spawns agent processes.
 * 
 * Usage: npm run cron
 * 
 * In production, run this as a background service (systemd, pm2, etc.)
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Simple cron parser and scheduler
class CronScheduler {
  constructor() {
    this.jobs = [];
    this.interval = null;
  }

  addJob(id, schedule, callback) {
    this.jobs.push({ id, schedule, callback, lastRun: null });
  }

  start() {
    console.log(`⏰ Cron scheduler started with ${this.jobs.length} jobs`);
    // Check every minute
    this.interval = setInterval(() => this.tick(), 60000);
    this.tick(); // Run immediately
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    console.log('⏰ Cron scheduler stopped');
  }

  tick() {
    const now = new Date();
    for (const job of this.jobs) {
      if (this.matches(job.schedule, now) && !this.ranThisMinute(job, now)) {
        job.lastRun = now;
        console.log(`[${now.toISOString()}] Running: ${job.id}`);
        job.callback();
      }
    }
  }

  ranThisMinute(job, now) {
    if (!job.lastRun) return false;
    return job.lastRun.getMinutes() === now.getMinutes() &&
           job.lastRun.getHours() === now.getHours() &&
           job.lastRun.getDate() === now.getDate();
  }

  matches(schedule, date) {
    const [min, hour, dom, month, dow] = schedule.split(' ');
    return this.fieldMatches(min, date.getMinutes()) &&
           this.fieldMatches(hour, date.getHours()) &&
           this.fieldMatches(dom, date.getDate()) &&
           this.fieldMatches(month, date.getMonth() + 1) &&
           this.fieldMatches(dow, date.getDay());
  }

  fieldMatches(field, value) {
    if (field === '*') return true;

    // Handle */N (every N)
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2));
      return value % step === 0;
    }

    // Handle ranges (1-5)
    if (field.includes('-')) {
      const parts = field.split(',');
      return parts.some(part => {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(Number);
          return value >= start && value <= end;
        }
        return parseInt(part) === value;
      });
    }

    // Handle lists (1,3,5)
    if (field.includes(',')) {
      return field.split(',').map(Number).includes(value);
    }

    return parseInt(field) === value;
  }
}

function runAgent(agentId, prompt) {
  const agentFile = join(ROOT, 'agents', `${agentId}.agent.md`);
  const args = ['run', agentFile];
  if (prompt) {
    args.push('--prompt', prompt);
  }

  const proc = spawn('copilot-cli', args, {
    cwd: ROOT,
    stdio: 'pipe',
    env: { ...process.env, HOMEOS_DATA_DIR: join(ROOT, 'data') }
  });

  proc.stdout.on('data', (data) => {
    console.log(`  [${agentId}] ${data.toString().trim()}`);
  });

  proc.stderr.on('data', (data) => {
    console.error(`  [${agentId}] ERROR: ${data.toString().trim()}`);
  });

  proc.on('close', (code) => {
    if (code !== 0) {
      console.error(`  [${agentId}] Exited with code ${code}`);
    }
  });
}

// Main
const config = JSON.parse(readFileSync(join(ROOT, 'cron.json'), 'utf-8'));
const scheduler = new CronScheduler();

console.log(`\n🏠 Home OS Cron Runner`);
console.log(`   Timezone: ${config.timezone}`);
console.log(`   Jobs: ${config.jobs.length} total\n`);

for (const job of config.jobs) {
  if (!job.enabled) {
    console.log(`   ⏸️  ${job.id} (disabled)`);
    continue;
  }

  scheduler.addJob(job.id, job.schedule, () => runAgent(job.agent, job.prompt));
  console.log(`   ✅ ${job.id} → ${job.schedule} → ${job.agent}`);
}

console.log('');
scheduler.start();

// Graceful shutdown
process.on('SIGINT', () => {
  scheduler.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  scheduler.stop();
  process.exit(0);
});
