/**
 * YAML Profile Loader — Phase 4
 *
 * Loads agent profiles from config/profiles/*.yaml with validation.
 * Supports hot-reload via file watcher.
 */

import { readdirSync, readFileSync, existsSync, watch, type FSWatcher } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AgentProfile, ProfileValidationResult } from '../types.js';
import { validateProfile } from './validator.js';
import { HOME_OS_ROOT } from '../utils/paths.js';

const PROFILES_DIR = resolve(HOME_OS_ROOT, 'config', 'profiles');

export type ProfileChangeCallback = (profiles: AgentProfile[], errors: ProfileValidationResult[]) => void;

let _watcher: FSWatcher | null = null;
let _changeCallbacks: ProfileChangeCallback[] = [];

/**
 * Load all YAML profiles from config/profiles/*.yaml with validation.
 */
export function loadYamlProfiles(): AgentProfile[] {
  const results = loadYamlProfilesWithValidation();
  return results
    .filter((r) => r.valid && r.profile !== null)
    .map((r) => r.profile!);
}

/**
 * Load and validate all YAML profiles, returning validation results.
 */
export function loadYamlProfilesWithValidation(): ProfileValidationResult[] {
  if (!existsSync(PROFILES_DIR)) {
    return [];
  }

  const files = readdirSync(PROFILES_DIR).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.yml')
  );

  const results: ProfileValidationResult[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(PROFILES_DIR, file), 'utf8');
      const parsed = parseYaml(content);
      results.push(validateProfile(parsed, file));
    } catch (err) {
      results.push({
        valid: false,
        profile: null,
        errors: [{ file, field: '(parse)', message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}` }],
      });
    }
  }

  return results;
}

/**
 * Start watching the profiles directory for changes. Calls registered callbacks on change.
 */
export function startProfileWatcher(): void {
  if (_watcher) return; // Already watching
  if (!existsSync(PROFILES_DIR)) return;

  _watcher = watch(PROFILES_DIR, { persistent: false }, (_eventType, _filename) => {
    // Debounce — reload after short delay
    setTimeout(() => {
      const results = loadYamlProfilesWithValidation();
      const validProfiles = results
        .filter((r) => r.valid && r.profile !== null)
        .map((r) => r.profile!);
      const errorResults = results.filter((r) => !r.valid);

      for (const cb of _changeCallbacks) {
        try {
          cb(validProfiles, errorResults);
        } catch {
          // Don't let callback errors crash the watcher
        }
      }
    }, 100);
  });
}

/**
 * Stop the profile watcher.
 */
export function stopProfileWatcher(): void {
  if (_watcher) {
    _watcher.close();
    _watcher = null;
  }
  _changeCallbacks = [];
}

/**
 * Register a callback for profile changes.
 */
export function onProfileChange(callback: ProfileChangeCallback): void {
  _changeCallbacks.push(callback);
}

/**
 * Get the profiles directory path (for testing/diagnostics).
 */
export function getProfilesDir(): string {
  return PROFILES_DIR;
}

