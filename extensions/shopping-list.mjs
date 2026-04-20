/**
 * Home OS — Shopping List Extension
 * 
 * Manages a shared family shopping list with categories,
 * store preferences, and purchase history.
 * 
 * Tools exposed:
 * - add_to_shopping_list: Add item(s)
 * - shopping_list: View current list
 * - check_off_item: Mark as purchased
 * - remove_from_list: Delete an item
 * - clear_shopping_list: Archive and reset
 * - shopping_history: Recent purchases
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const DATA_DIR = process.env.HOMEOS_DATA_DIR || join(process.cwd(), 'data');
const SHOPPING_DIR = join(DATA_DIR, 'shopping');

function ensureDir() {
  if (!existsSync(SHOPPING_DIR)) mkdirSync(SHOPPING_DIR, { recursive: true });
}

function loadList() {
  ensureDir();
  const path = join(SHOPPING_DIR, 'current-list.json');
  if (!existsSync(path)) return { items: [], created_at: new Date().toISOString() };
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveList(list) {
  ensureDir();
  writeFileSync(join(SHOPPING_DIR, 'current-list.json'), JSON.stringify(list, null, 2));
}

const CATEGORIES = ['produce', 'dairy', 'meat', 'bakery', 'pantry', 'frozen', 'beverages', 'snacks', 'household', 'personal_care', 'pharmacy', 'baby', 'pet', 'other'];

export function addToShoppingList({ items, category, quantity, unit, store, added_by }) {
  const list = loadList();
  const itemNames = items.split(',').map(i => i.trim()).filter(Boolean);
  const added = [];

  for (const name of itemNames) {
    const item = {
      id: list.items.length + 1,
      name,
      category: category || 'other',
      quantity: quantity || '1',
      unit: unit || '',
      store: store || '',
      added_by: added_by || '',
      purchased: false,
      added_at: new Date().toISOString()
    };
    list.items.push(item);
    added.push(item);
  }

  saveList(list);
  return { success: true, added: added.length, items: added, message: `Added ${added.length} item(s) to shopping list` };
}

export function shoppingList({ group_by, store } = {}) {
  const list = loadList();
  let items = list.items.filter(i => !i.purchased);

  if (store) {
    items = items.filter(i => i.store.toLowerCase().includes(store.toLowerCase()));
  }

  if (group_by === 'store') {
    const grouped = {};
    items.forEach(i => {
      const key = i.store || 'Any Store';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(i);
    });
    return { grouped, total: items.length };
  }

  // Default: group by category
  const grouped = {};
  items.forEach(i => {
    const key = i.category || 'other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(i);
  });
  return { grouped, total: items.length };
}

export function checkOffItem({ item }) {
  const list = loadList();
  const found = list.items.find(i =>
    !i.purchased && (
      i.id.toString() === item ||
      i.name.toLowerCase().includes(item.toLowerCase())
    )
  );

  if (!found) return { success: false, message: `Item "${item}" not found` };

  found.purchased = true;
  found.purchased_at = new Date().toISOString();
  saveList(list);

  // Add to history
  const history = loadHistory();
  history.push({ ...found });
  saveHistory(history);

  return { success: true, item: found, message: `✅ ${found.name} checked off` };
}

export function removeFromList({ item }) {
  const list = loadList();
  const idx = list.items.findIndex(i =>
    i.id.toString() === item ||
    i.name.toLowerCase().includes(item.toLowerCase())
  );

  if (idx === -1) return { success: false, message: `Item "${item}" not found` };

  const removed = list.items.splice(idx, 1)[0];
  saveList(list);
  return { success: true, item: removed, message: `Removed ${removed.name} from list` };
}

export function clearShoppingList() {
  const list = loadList();
  // Archive
  const archivePath = join(SHOPPING_DIR, `archive-${Date.now()}.json`);
  writeFileSync(archivePath, JSON.stringify(list, null, 2));
  // Reset
  saveList({ items: [], created_at: new Date().toISOString() });
  return { success: true, archived: list.items.length, message: `List archived (${list.items.length} items). Fresh list started.` };
}

export function shoppingHistory({ days } = {}) {
  const lookBack = days || 30;
  const history = loadHistory();
  const cutoff = new Date(Date.now() - lookBack * 24 * 60 * 60 * 1000).toISOString();
  return history.filter(i => i.purchased_at >= cutoff);
}

function loadHistory() {
  const path = join(SHOPPING_DIR, 'history.json');
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function saveHistory(history) {
  ensureDir();
  writeFileSync(join(SHOPPING_DIR, 'history.json'), JSON.stringify(history, null, 2));
}
