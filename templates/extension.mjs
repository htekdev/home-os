/**
 * Home OS — Extension Template
 * 
 * Use this template to create new tool integrations.
 * Extensions are Node.js ESM modules that export functions.
 * Each exported function becomes a tool available to agents.
 * 
 * Naming convention: kebab-case filename, camelCase exports.
 * 
 * Tools exposed:
 * - myTool: Description of what it does
 * - anotherTool: Description of what it does
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// Data directory — all persistent data lives here
const DATA_DIR = process.env.HOMEOS_DATA_DIR || join(process.cwd(), 'data');
const MY_DATA_DIR = join(DATA_DIR, 'my-extension');

// Ensure data directory exists
function ensureDir() {
  if (!existsSync(MY_DATA_DIR)) mkdirSync(MY_DATA_DIR, { recursive: true });
}

// Load JSON file with fallback default
function loadJson(filename, defaultValue = []) {
  const path = join(MY_DATA_DIR, filename);
  if (!existsSync(path)) return defaultValue;
  return JSON.parse(readFileSync(path, 'utf-8'));
}

// Save JSON file
function saveJson(filename, data) {
  ensureDir();
  writeFileSync(join(MY_DATA_DIR, filename), JSON.stringify(data, null, 2));
}

/**
 * Example tool function.
 * 
 * @param {Object} params - Tool parameters (from agent)
 * @param {string} params.name - Example required parameter
 * @param {string} [params.optional] - Example optional parameter
 * @returns {Object} Result object with success status and data
 */
export function myTool({ name, optional }) {
  ensureDir();

  // Your logic here
  const result = {
    name,
    processed: true,
    timestamp: new Date().toISOString()
  };

  // Persist data
  const items = loadJson('items.json');
  items.push(result);
  saveJson('items.json', items);

  return {
    success: true,
    data: result,
    message: `Processed "${name}" successfully`
  };
}

/**
 * Example query tool.
 * 
 * @param {Object} params - Filter parameters
 * @returns {Array} Matching items
 */
export function queryItems({ search } = {}) {
  const items = loadJson('items.json');

  if (search) {
    return items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  }

  return items;
}
