import type { AgentProfile, ProfileValidationResult } from '../types.js';
import { HOME_OS_ROOT } from '../utils/paths.js';
import { loadYamlProfiles, loadYamlProfilesWithValidation, startProfileWatcher, stopProfileWatcher, onProfileChange } from './loader.js';

export { startProfileWatcher, stopProfileWatcher, onProfileChange } from './loader.js';
export { validateProfile } from './validator.js';
export { loadYamlProfilesWithValidation } from './loader.js';

const BASE_PROMPT = [
  'You are a persistent Home OS agent managed by the Home OS daemon.',
  'You keep your own session state across follow-up turns.',
  'Use tools deliberately and preserve continuity between messages.',
  'If the user returns later, continue from prior context instead of restarting from scratch.',
].join(' ');

const BUILTIN_PROFILES: Record<string, AgentProfile> = {
  'home-assistant': {
    name: 'home-assistant',
    description: 'General family operations agent for Home OS.',
    systemPrompt: `${BASE_PROMPT}\n\nYou are the home-assistant profile. Focus on household coordination, tasks, scheduling, and family logistics.`,
    cwd: HOME_OS_ROOT,
    baseTools: ['file-tools'],
    bootstrapPrompt: 'Acknowledge that the persistent home-assistant session is ready.',
  },
  'nicu-care': {
    name: 'nicu-care',
    description: 'NICU support and pumping coordination agent.',
    systemPrompt: `${BASE_PROMPT}\n\nYou are the nicu-care profile. Focus on NICU coordination, pumping support, and baby-related follow-up work.`,
    cwd: HOME_OS_ROOT,
    baseTools: ['file-tools'],
    bootstrapPrompt: 'Acknowledge that the persistent nicu-care session is ready.',
  },
  'platform-manager': {
    name: 'platform-manager',
    description: 'Platform health and governance agent.',
    systemPrompt: `${BASE_PROMPT}\n\nYou are the platform-manager profile. Focus on runtime health, architecture, and platform operations.`,
    cwd: HOME_OS_ROOT,
    baseTools: ['dev-tools'],
    bootstrapPrompt: 'Acknowledge that the persistent platform-manager session is ready.',
  },
};

// Merge built-in and YAML profiles (built-in takes precedence on name collision)
let _cachedProfiles: Record<string, AgentProfile> | null = null;

function getAllProfiles(): Record<string, AgentProfile> {
  if (_cachedProfiles) return _cachedProfiles;

  const merged: Record<string, AgentProfile> = {};

  // Load YAML profiles first (lower precedence)
  for (const profile of loadYamlProfiles()) {
    merged[profile.name] = profile;
  }

  // Built-in profiles override YAML on collision
  for (const [name, profile] of Object.entries(BUILTIN_PROFILES)) {
    merged[name] = profile;
  }

  _cachedProfiles = merged;
  return merged;
}

/** Clear cached profiles — useful for testing and hot-reload */
export function clearProfileCache(): void {
  _cachedProfiles = null;
}

/**
 * Enable hot-reload: watches profiles dir and clears cache on changes.
 * Returns a cleanup function.
 */
export function enableHotReload(onChange?: (profiles: AgentProfile[]) => void): () => void {
  onProfileChange((profiles, _errors) => {
    clearProfileCache();
    if (onChange) {
      onChange(listProfiles());
    }
  });
  startProfileWatcher();
  return () => {
    stopProfileWatcher();
  };
}

export function listProfiles(): AgentProfile[] {
  return Object.values(getAllProfiles());
}

export function getProfile(name: string): AgentProfile | null {
  return getAllProfiles()[name] ?? null;
}
