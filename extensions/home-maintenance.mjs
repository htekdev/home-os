/**
 * Home OS — Home Maintenance Extension
 * 
 * Tracks recurring maintenance tasks, service providers,
 * and maintenance history for the home.
 * 
 * Tools exposed:
 * - add_maintenance_task: Add recurring maintenance item
 * - maintenance_due: Show overdue and upcoming tasks
 * - log_maintenance: Record completed maintenance
 * - add_service_provider: Save a provider's info
 * - find_provider: Search saved providers
 * - maintenance_summary: Overview dashboard
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.HOMEOS_DATA_DIR || join(process.cwd(), 'data');
const HOME_DIR = join(DATA_DIR, 'home');

function ensureDir() {
  if (!existsSync(HOME_DIR)) mkdirSync(HOME_DIR, { recursive: true });
}

function loadJson(filename, defaultValue = []) {
  ensureDir();
  const path = join(HOME_DIR, filename);
  if (!existsSync(path)) return defaultValue;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveJson(filename, data) {
  ensureDir();
  writeFileSync(join(HOME_DIR, filename), JSON.stringify(data, null, 2));
}

function generateSlug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
}

export function addMaintenanceTask({ task, area, frequency_months, priority, last_done, notes }) {
  const tasks = loadJson('maintenance-schedule.json');
  const id = generateSlug(`${area}-${task}`);
  const lastDone = last_done || new Date().toISOString().split('T')[0];
  const nextDue = calculateNextDue(lastDone, frequency_months);

  tasks.push({
    id,
    task,
    area,
    frequency_months,
    priority: priority || 'medium',
    last_done: lastDone,
    next_due: nextDue,
    notes: notes || '',
    created_at: new Date().toISOString()
  });

  saveJson('maintenance-schedule.json', tasks);
  return { success: true, id, next_due: nextDue, message: `Maintenance task "${task}" added. Next due: ${nextDue}` };
}

export function maintenanceDue({ within_days } = {}) {
  const lookAhead = within_days || 30;
  const tasks = loadJson('maintenance-schedule.json');
  const today = new Date().toISOString().split('T')[0];
  const cutoff = new Date(Date.now() + lookAhead * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const overdue = tasks.filter(t => t.next_due < today).map(t => ({ ...t, status: '🔴 OVERDUE', days_overdue: daysBetween(t.next_due, today) }));
  const upcoming = tasks.filter(t => t.next_due >= today && t.next_due <= cutoff).map(t => ({ ...t, status: '🟡 UPCOMING', days_until: daysBetween(today, t.next_due) }));
  const onTrack = tasks.filter(t => t.next_due > cutoff).map(t => ({ ...t, status: '🟢 ON TRACK' }));

  return { overdue, upcoming, onTrack, summary: { overdue: overdue.length, upcoming: upcoming.length, onTrack: onTrack.length } };
}

export function logMaintenance({ task_id, notes, cost, provider }) {
  const tasks = loadJson('maintenance-schedule.json');
  const task = tasks.find(t => t.id === task_id);
  if (!task) return { success: false, message: `Task "${task_id}" not found` };

  const today = new Date().toISOString().split('T')[0];
  task.last_done = today;
  task.next_due = calculateNextDue(today, task.frequency_months);
  saveJson('maintenance-schedule.json', tasks);

  // Append to log
  const log = loadJson('maintenance-log.json');
  log.push({
    task_id,
    task_name: task.task,
    date: today,
    notes: notes || '',
    cost: cost || null,
    provider: provider || '',
    logged_at: new Date().toISOString()
  });
  saveJson('maintenance-log.json', log);

  return { success: true, message: `✅ ${task.task} logged. Next due: ${task.next_due}` };
}

export function addServiceProvider({ name, type, phone, email, rating, notes }) {
  const providers = loadJson('service-providers.json');
  const id = generateSlug(name);

  providers.push({
    id,
    name,
    type,
    phone: phone || '',
    email: email || '',
    rating: rating || 0,
    notes: notes || '',
    created_at: new Date().toISOString()
  });

  saveJson('service-providers.json', providers);
  return { success: true, id, message: `Provider "${name}" (${type}) saved` };
}

export function findProvider({ type, name } = {}) {
  const providers = loadJson('service-providers.json');
  return providers.filter(p => {
    if (type && p.type !== type) return false;
    if (name && !p.name.toLowerCase().includes(name.toLowerCase())) return false;
    return true;
  });
}

export function maintenanceSummary() {
  const due = maintenanceDue({ within_days: 30 });
  const providers = loadJson('service-providers.json');
  const log = loadJson('maintenance-log.json');
  const recentLog = log.slice(-10);

  return {
    ...due.summary,
    totalProviders: providers.length,
    recentActivity: recentLog,
    totalMaintenanceTasks: loadJson('maintenance-schedule.json').length
  };
}

function calculateNextDue(lastDone, frequencyMonths) {
  const date = new Date(lastDone);
  date.setMonth(date.getMonth() + frequencyMonths);
  return date.toISOString().split('T')[0];
}

function daysBetween(date1, date2) {
  return Math.round((new Date(date2) - new Date(date1)) / (1000 * 60 * 60 * 24));
}
