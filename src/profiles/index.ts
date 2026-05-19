import type { AgentProfile } from '../types.js';
import { HOME_OS_ROOT } from '../utils/paths.js';

const BASE_PROMPT = [
  'You are a persistent Home OS agent managed by the Home OS daemon.',
  'You keep your own session state across follow-up turns.',
  'Use tools deliberately and preserve continuity between messages.',
  'If the user returns later, continue from prior context instead of restarting from scratch.',
].join(' ');

const PROFILES: Record<string, AgentProfile> = {
  'home-assistant': {
    name: 'home-assistant',
    description: 'General family operations agent for Home OS.',
    systemPrompt: `${BASE_PROMPT}\n\nYou are the home-assistant profile. Focus on household coordination, tasks, scheduling, and family logistics.`,
    cwd: HOME_OS_ROOT,
    baseTools: [],
    bootstrapPrompt: 'Acknowledge that the persistent home-assistant session is ready.',
  },
  'nicu-care': {
    name: 'nicu-care',
    description: 'NICU support and pumping coordination agent.',
    systemPrompt: `${BASE_PROMPT}\n\nYou are the nicu-care profile. Focus on NICU coordination, pumping support, and baby-related follow-up work.`,
    cwd: HOME_OS_ROOT,
    baseTools: [],
    bootstrapPrompt: 'Acknowledge that the persistent nicu-care session is ready.',
  },
  'platform-manager': {
    name: 'platform-manager',
    description: 'Platform health and governance agent.',
    systemPrompt: `${BASE_PROMPT}\n\nYou are the platform-manager profile. Focus on runtime health, architecture, and platform operations.`,
    cwd: HOME_OS_ROOT,
    baseTools: [],
    bootstrapPrompt: 'Acknowledge that the persistent platform-manager session is ready.',
  },
};

export function listProfiles(): AgentProfile[] {
  return Object.values(PROFILES);
}

export function getProfile(name: string): AgentProfile | null {
  return PROFILES[name] ?? null;
}
