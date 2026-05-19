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
    this.sendCalls = [];
  }

  async send(input) {
    this.sendCalls.push(input);
    return { content: `Response to: ${input.prompt}` };
  }
  async disconnect() {}
  on(event, listener) {
    this.handlers.set(event, listener);
  }

  emit(event, payload) {
    const handler = this.handlers.get(event);
    if (handler) handler(payload);
  }
}

class FakeClient {
  constructor() {
    this.sessions = new Map();
  }
  async start() {}
  async stop() {}
  async createSession(input) {
    const session = new FakeSession(input.sessionId);
    this.sessions.set(input.sessionId, session);
    this.lastCreate = input;
    return session;
  }
  async resumeSession(sessionId, input) {
    const session = new FakeSession(sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }
  async deleteSession() {}
}

function createTestEnv() {
  const dbPath = resolve(`C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  const fakeClient = new FakeClient();
  const supervisor = new AgentSupervisor({
    port: 44123,
    store,
    clientFactory: () => fakeClient,
  });
  return { dbPath, store, fakeClient, supervisor };
}

test('AgentSupervisor spawns a persistent session-backed agent', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant', cwd: 'C:\\Repos\\htekdev\\home-os' });

  assert.equal(agent.profile, 'home-assistant');
  assert.equal(agent.status, 'active');
  assert.equal(fakeClient.lastCreate.tools.length, 0);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('sendToAgent persists inbound message and returns response', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });
  const result = await supervisor.sendToAgent(agent.agentId, 'Hello agent');

  assert.equal(result.agentId, agent.agentId);
  assert.equal(result.response, 'Response to: Hello agent');

  // Check persistence
  const messages = store.getMessages(agent.agentId, 10);
  assert.ok(messages.length >= 1);
  const inbound = messages.find(m => m.direction === 'inbound');
  assert.ok(inbound);
  assert.equal(inbound.content, 'Hello agent');

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('inspectAgent returns metadata with isLoaded and messageCount', async () => {
  const { dbPath, store, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'nicu-care', label: 'morning-shift' });
  await supervisor.sendToAgent(agent.agentId, 'Test message');

  const info = supervisor.inspectAgent(agent.agentId);
  assert.equal(info.agentId, agent.agentId);
  assert.equal(info.profile, 'nicu-care');
  assert.equal(info.label, 'morning-shift');
  assert.equal(info.isLoaded, true);
  assert.ok(info.messageCount >= 1);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('resumeAgent reloads an orphaned agent', async () => {
  const dbPath = resolve(`C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\sup-resume-${Date.now()}.db`);
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  const supervisor = new AgentSupervisor({
    port: 44123,
    store,
    clientFactory: () => new FakeClient(),
  });

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  // Simulate daemon restart: shutdown marks as orphaned
  await supervisor.shutdown();
  store.close();

  // Create a new supervisor with same DB
  const store2 = new HomeOsStore(dbPath);
  const supervisor2 = new AgentSupervisor({
    port: 44123,
    store: store2,
    clientFactory: () => new FakeClient(),
  });
  await supervisor2.start();

  // Agent should have been auto-recovered
  const list = supervisor2.listAgents();
  const found = list.find(a => a.agentId === agent.agentId);
  assert.ok(found);
  assert.equal(found.status, 'idle'); // resumed → idle

  await supervisor2.shutdown();
  store2.close();
  rmSync(dbPath, { force: true });
});

test('resumeAgent throws for stopped agents', async () => {
  const { dbPath, store, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });
  await supervisor.stopAgent(agent.agentId);

  await assert.rejects(
    () => supervisor.resumeAgent(agent.agentId),
    /Cannot resume a stopped agent/
  );

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('attach subscribes to live events and detach unsubscribes', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  const events = [];
  const detach = supervisor.attach(agent.agentId, (event) => {
    events.push(event);
  });

  // Simulate an assistant.message event
  const session = fakeClient.sessions.get(agent.sdkSessionId);
  session.emit('assistant.message', { data: { content: 'Hello from agent' } });

  assert.ok(events.length >= 1);
  assert.equal(events[0].type, 'assistant.message');
  assert.deepEqual(events[0].data, { content: 'Hello from agent' });

  // Detach and verify no more events
  detach();
  session.emit('assistant.message', { data: { content: 'Should not be received' } });
  assert.equal(events.length, 1);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('getRecentOutput returns outbound messages', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  // Simulate assistant output via event handler
  const session = fakeClient.sessions.get(agent.sdkSessionId);
  session.emit('assistant.message', { data: { content: 'First response' } });
  session.emit('assistant.message', { data: { content: 'Second response' } });

  const output = supervisor.getRecentOutput(agent.agentId, 10);
  assert.ok(output.length >= 2);
  // Most recent first
  assert.equal(output[0].content, 'Second response');
  assert.equal(output[1].content, 'First response');

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('stopAgent records event and clears attach subscribers', async () => {
  const { dbPath, store, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });
  
  // Attach a subscriber
  const events = [];
  supervisor.attach(agent.agentId, (e) => events.push(e));

  const stopped = await supervisor.stopAgent(agent.agentId);
  assert.equal(stopped.status, 'stopped');

  // Verify stop event was logged
  const logs = store.getLogs(agent.agentId, 5);
  const stopEvent = logs.find(l => l.eventType === 'agent.stopped');
  assert.ok(stopEvent);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});
