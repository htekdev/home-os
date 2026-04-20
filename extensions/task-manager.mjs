/**
 * Home OS — Task Manager Extension
 * 
 * Provides task CRUD operations, dependency tracking, and smart ordering.
 * Tasks are stored in a SQLite database for fast querying.
 * 
 * Tools exposed:
 * - add_task: Create a new task
 * - list_tasks: Query tasks with filters
 * - update_task: Modify task properties
 * - complete_task: Mark done, handle recurrence
 * - delete_task: Remove a task
 * - task_summary: Dashboard overview
 * - ready_tasks: Tasks with resolved dependencies
 */

import { existsSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';

const DATA_DIR = process.env.HOMEOS_DATA_DIR || join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'tasks.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done','blocked')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('urgent','high','medium','low')),
      assignee TEXT DEFAULT '',
      category TEXT DEFAULT 'general',
      due_date TEXT,
      location TEXT DEFAULT '',
      recurrence TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_deps (
      task_id TEXT NOT NULL,
      depends_on TEXT NOT NULL,
      PRIMARY KEY (task_id, depends_on),
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
  `);
}

function generateId(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) + '-' + Date.now().toString(36).slice(-4);
}

export function addTask({ title, description, status, priority, assignee, category, due_date, location, recurrence, notes, depends_on }) {
  const db = getDb();
  const id = generateId(title);

  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, assignee, category, due_date, location, recurrence, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description || '', status || 'pending', priority || 'medium', assignee || '', category || 'general', due_date || null, location || '', recurrence || '', notes || '');

  if (depends_on) {
    const deps = depends_on.split(',').map(d => d.trim());
    const stmt = db.prepare('INSERT OR IGNORE INTO task_deps (task_id, depends_on) VALUES (?, ?)');
    for (const dep of deps) {
      stmt.run(id, dep);
    }
  }

  return { success: true, id, title, message: `Task "${title}" created with ID: ${id}` };
}

export function listTasks({ status, priority, assignee, category, due_date_before, due_date_after, location } = {}) {
  const db = getDb();
  let query = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (status) { query += ' AND status = ?'; params.push(status); }
  if (priority) { query += ' AND priority = ?'; params.push(priority); }
  if (assignee) { query += ' AND assignee = ?'; params.push(assignee); }
  if (category) { query += ' AND category = ?'; params.push(category); }
  if (due_date_before) { query += ' AND due_date <= ?'; params.push(due_date_before); }
  if (due_date_after) { query += ' AND due_date >= ?'; params.push(due_date_after); }
  if (location) { query += ' AND location LIKE ?'; params.push(`%${location}%`); }

  query += ` ORDER BY 
    CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
    CASE WHEN due_date IS NULL THEN 1 ELSE 0 END,
    due_date ASC`;

  return db.prepare(query).all(...params);
}

export function updateTask({ id, title, description, status, priority, assignee, category, due_date, location, recurrence, notes }) {
  const db = getDb();
  const fields = [];
  const params = [];

  if (title !== undefined) { fields.push('title = ?'); params.push(title); }
  if (description !== undefined) { fields.push('description = ?'); params.push(description); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (priority !== undefined) { fields.push('priority = ?'); params.push(priority); }
  if (assignee !== undefined) { fields.push('assignee = ?'); params.push(assignee); }
  if (category !== undefined) { fields.push('category = ?'); params.push(category); }
  if (due_date !== undefined) { fields.push('due_date = ?'); params.push(due_date); }
  if (location !== undefined) { fields.push('location = ?'); params.push(location); }
  if (recurrence !== undefined) { fields.push('recurrence = ?'); params.push(recurrence); }
  if (notes !== undefined) { fields.push('notes = ?'); params.push(notes); }

  fields.push("updated_at = datetime('now')");
  params.push(id);

  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...params);
  return { success: true, id, message: `Task ${id} updated` };
}

export function completeTask({ id }) {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) return { success: false, message: `Task ${id} not found` };

  db.prepare(`UPDATE tasks SET status = 'done', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);

  // Handle recurrence
  if (task.recurrence) {
    const nextDue = calculateNextDue(task.due_date, task.recurrence);
    const newId = generateId(task.title);
    db.prepare(`
      INSERT INTO tasks (id, title, description, priority, assignee, category, due_date, location, recurrence, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, task.title, task.description, task.priority, task.assignee, task.category, nextDue, task.location, task.recurrence, task.notes);
    return { success: true, id, message: `Task completed. Next occurrence created: ${newId} (due ${nextDue})` };
  }

  return { success: true, id, message: `Task "${task.title}" completed! 🎉` };
}

export function deleteTask({ id }) {
  const db = getDb();
  db.prepare('DELETE FROM task_deps WHERE task_id = ? OR depends_on = ?').run(id, id);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return { success: true, id, message: `Task ${id} deleted` };
}

export function taskSummary() {
  const db = getDb();
  const byStatus = db.prepare(`SELECT status, COUNT(*) as count FROM tasks GROUP BY status`).all();
  const byPriority = db.prepare(`SELECT priority, COUNT(*) as count FROM tasks WHERE status != 'done' GROUP BY priority`).all();
  const byAssignee = db.prepare(`SELECT assignee, COUNT(*) as count FROM tasks WHERE status != 'done' GROUP BY assignee`).all();
  const byCategory = db.prepare(`SELECT category, COUNT(*) as count FROM tasks WHERE status != 'done' GROUP BY category`).all();
  const overdue = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status != 'done' AND due_date < date('now')`).get();
  const dueThisWeek = db.prepare(`SELECT COUNT(*) as count FROM tasks WHERE status != 'done' AND due_date BETWEEN date('now') AND date('now', '+7 days')`).get();

  return { byStatus, byPriority, byAssignee, byCategory, overdue: overdue.count, dueThisWeek: dueThisWeek.count };
}

export function readyTasks() {
  const db = getDb();
  return db.prepare(`
    SELECT t.* FROM tasks t
    WHERE t.status = 'pending'
    AND NOT EXISTS (
      SELECT 1 FROM task_deps td
      JOIN tasks dep ON td.depends_on = dep.id
      WHERE td.task_id = t.id AND dep.status != 'done'
    )
    ORDER BY 
      CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 WHEN 'low' THEN 4 END,
      CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END,
      t.due_date ASC
  `).all();
}

function calculateNextDue(currentDue, recurrence) {
  const date = currentDue ? new Date(currentDue) : new Date();
  switch (recurrence.toLowerCase()) {
    case 'daily': date.setDate(date.getDate() + 1); break;
    case 'weekly': date.setDate(date.getDate() + 7); break;
    case 'monthly': date.setMonth(date.getMonth() + 1); break;
    case 'yearly': date.setFullYear(date.getFullYear() + 1); break;
    default: date.setDate(date.getDate() + 7); break;
  }
  return date.toISOString().split('T')[0];
}
