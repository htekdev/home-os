import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfile, listProfiles, clearProfileCache } from '../dist/profiles/index.js';

test('listProfiles exposes built-in profiles plus YAML profiles', () => {
  clearProfileCache();
  const profiles = listProfiles().map((profile) => profile.name);
  // Built-in profiles always present
  assert.ok(profiles.includes('home-assistant'));
  assert.ok(profiles.includes('nicu-care'));
  assert.ok(profiles.includes('platform-manager'));
  // YAML profile loaded from config/profiles/
  assert.ok(profiles.includes('coding-assistant'), 'Should load coding-assistant from YAML');
});

test('getProfile returns null for unknown profiles', () => {
  assert.equal(getProfile('missing-profile'), null);
});

test('YAML profiles have correct fields', () => {
  clearProfileCache();
  const profile = getProfile('coding-assistant');
  assert.ok(profile);
  assert.equal(profile.name, 'coding-assistant');
  assert.ok(profile.systemPrompt.length > 0);
  assert.ok(profile.baseTools.includes('dev-tools'));
  assert.ok(profile.bootstrapPrompt?.includes('coding-assistant'));
});

test('built-in profiles have baseTools configured', () => {
  clearProfileCache();
  const ha = getProfile('home-assistant');
  assert.ok(ha);
  assert.ok(ha.baseTools.includes('file-tools'));
  
  const pm = getProfile('platform-manager');
  assert.ok(pm);
  assert.ok(pm.baseTools.includes('dev-tools'));
});
