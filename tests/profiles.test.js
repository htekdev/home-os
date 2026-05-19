import test from 'node:test';
import assert from 'node:assert/strict';
import { getProfile, listProfiles } from '../dist/profiles/index.js';

test('listProfiles exposes phase 1 built-in profiles', () => {
  const profiles = listProfiles().map((profile) => profile.name);
  assert.deepEqual(profiles.sort(), ['home-assistant', 'nicu-care', 'platform-manager']);
});

test('getProfile returns null for unknown profiles', () => {
  assert.equal(getProfile('missing-profile'), null);
});
