import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { AgentSupervisor } from '../dist/daemon/supervisor.js';
import { HomeOsStore } from '../dist/store/db.js';

class FakeSession {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.handlers = new Map();
  }

  async send() {}
  async disconnect() {}
  on(event, listener) {
    this.handlers.set(event, listener);
  }
}

class FakeClient {
  async start() {}
  async stop() {}
  async createSession(input) {
    this.lastCreate = input;
    return new FakeSession(input.sessionId);
  }
  async deleteSession() {}
}

test('AgentSupervisor spawns a persistent session-backed agent', async () => {
  const dbPath = resolve('C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\supervisor-test.db');
  rmSync(dbPath, { force: true });

  const store = new HomeOsStore(dbPath);
  const fakeClient = new FakeClient();
  const supervisor = new AgentSupervisor({
    port: 44123,
    store,
    clientFactory: () => fakeClient,
  });

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant', cwd: 'C:\\Repos\\htekdev\\home-os' });

  assert.equal(agent.profile, 'home-assistant');
  assert.equal(agent.status, 'active');
  assert.equal(fakeClient.lastCreate.tools.length, 0);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});
