import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { HomeOsStore } from '../dist/store/db.js';

const dbPath = resolve('C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\store-test.db');

test('HomeOsStore initializes schema and upserts agents', () => {
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  store.upsertAgent({
    agentId: 'agt_test',
    profile: 'home-assistant',
    label: null,
    sdkSessionId: 'sdk_test',
    cwd: 'C:\\Repos\\htekdev\\home-os',
    status: 'active',
    model: null,
    toolProfile: 'phase1-base',
    mcpProfile: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    lastActiveAt: '2026-05-19T00:00:00.000Z',
    stoppedAt: null,
    lastError: null,
    metadataJson: null,
  });

  const agents = store.listAgents();
  assert.equal(agents.length, 1);
  assert.equal(agents[0].agentId, 'agt_test');
  store.close();
  rmSync(dbPath, { force: true });
});
