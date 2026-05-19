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

test('getMessages returns messages for an agent', () => {
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  
  store.recordMessage({
    agentId: 'agt_msg',
    direction: 'inbound',
    role: 'user',
    content: 'Hello',
    createdAt: '2026-05-19T00:00:00.000Z',
    correlationId: null,
  });
  store.recordMessage({
    agentId: 'agt_msg',
    direction: 'outbound',
    role: 'assistant',
    content: 'Hi there',
    createdAt: '2026-05-19T00:00:01.000Z',
    correlationId: null,
  });

  const messages = store.getMessages('agt_msg', 10);
  assert.equal(messages.length, 2);
  // Most recent first
  assert.equal(messages[0].content, 'Hi there');
  assert.equal(messages[1].content, 'Hello');

  store.close();
  rmSync(dbPath, { force: true });
});

test('getRecentOutput returns only outbound messages', () => {
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  
  store.recordMessage({
    agentId: 'agt_out',
    direction: 'inbound',
    role: 'user',
    content: 'Question',
    createdAt: '2026-05-19T00:00:00.000Z',
    correlationId: null,
  });
  store.recordMessage({
    agentId: 'agt_out',
    direction: 'outbound',
    role: 'assistant',
    content: 'Answer',
    createdAt: '2026-05-19T00:00:01.000Z',
    correlationId: null,
  });

  const output = store.getRecentOutput('agt_out', 10);
  assert.equal(output.length, 1);
  assert.equal(output[0].content, 'Answer');
  assert.equal(output[0].direction, 'outbound');

  store.close();
  rmSync(dbPath, { force: true });
});

test('getResumableAgents returns active/idle/orphaned agents only', () => {
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);

  store.upsertAgent({
    agentId: 'agt_active',
    profile: 'home-assistant',
    label: null,
    sdkSessionId: 'sdk_active',
    cwd: '/tmp',
    status: 'active',
    model: null,
    toolProfile: null,
    mcpProfile: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    lastActiveAt: '2026-05-19T00:00:00.000Z',
    stoppedAt: null,
    lastError: null,
    metadataJson: null,
  });
  store.upsertAgent({
    agentId: 'agt_stopped',
    profile: 'nicu-care',
    label: null,
    sdkSessionId: 'sdk_stopped',
    cwd: '/tmp',
    status: 'stopped',
    model: null,
    toolProfile: null,
    mcpProfile: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    lastActiveAt: '2026-05-19T00:00:00.000Z',
    stoppedAt: '2026-05-19T01:00:00.000Z',
    lastError: null,
    metadataJson: null,
  });
  store.upsertAgent({
    agentId: 'agt_orphan',
    profile: 'platform-manager',
    label: null,
    sdkSessionId: 'sdk_orphan',
    cwd: '/tmp',
    status: 'orphaned',
    model: null,
    toolProfile: null,
    mcpProfile: null,
    createdAt: '2026-05-19T00:00:00.000Z',
    lastActiveAt: '2026-05-19T00:00:00.000Z',
    stoppedAt: null,
    lastError: null,
    metadataJson: null,
  });

  const resumable = store.getResumableAgents();
  assert.equal(resumable.length, 2);
  const ids = resumable.map(a => a.agentId);
  assert.ok(ids.includes('agt_active'));
  assert.ok(ids.includes('agt_orphan'));
  assert.ok(!ids.includes('agt_stopped'));

  store.close();
  rmSync(dbPath, { force: true });
});
