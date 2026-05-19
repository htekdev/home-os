/**
 * YAML Profile Loader — Phase 3
 *
 * Loads agent profiles from config/profiles/*.yaml in addition to built-in profiles.
 * YAML profiles follow the same AgentProfile schema as built-in ones.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { AgentProfile } from '../types.js';
import { HOME_OS_ROOT } from '../utils/paths.js';

const PROFILES_DIR = resolve(HOME_OS_ROOT, 'config', 'profiles');

/**
 * Load all YAML profiles from config/profiles/*.yaml
 */
export function loadYamlProfiles(): AgentProfile[] {
  if (!existsSync(PROFILES_DIR)) {
    return [];
  }

  const files = readdirSync(PROFILES_DIR).filter(
    (f) => f.endsWith('.yaml') || f.endsWith('.yml')
  );

  const profiles: AgentProfile[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(PROFILES_DIR, file), 'utf8');
      const parsed = parseYaml(content) as Partial<AgentProfile>;

      if (!parsed.name || !parsed.systemPrompt) {
        continue; // Skip invalid profiles
      }

      profiles.push({
        name: parsed.name,
        description: parsed.description ?? `Profile loaded from ${file}`,
        systemPrompt: parsed.systemPrompt,
        defaultModel: parsed.defaultModel,
        cwd: parsed.cwd,
        bootstrapPrompt: parsed.bootstrapPrompt,
        baseTools: parsed.baseTools ?? [],
        customTools: parsed.customTools,
        mcpProfile: parsed.mcpProfile,
      });
    } catch {
      // Skip files that fail to parse
    }
  }

  return profiles;
}

/**
 * Get the profiles directory path (for testing/diagnostics).
 */
export function getProfilesDir(): string {
  return PROFILES_DIR;
}
