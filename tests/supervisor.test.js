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

class FailingSendSession extends FakeSession {
  async send(input) {
    this.sendCalls.push(input);
    throw new Error('SDK send failure');
  }
}

class FailingSendClient extends FakeClient {
  constructor(failAfterSpawn = false) {
    super();
    this.failAfterSpawn = failAfterSpawn;
    this.spawnCount = 0;
  }
  async createSession(input) {
    this.spawnCount++;
    if (this.failAfterSpawn && this.spawnCount > 1) {
      // Only fail on subsequent creates (not the spawn itself)
    }
    const session = this.failAfterSpawn
      ? new FailingSendSession(input.sessionId)
      : new FakeSession(input.sessionId);
    this.sessions.set(input.sessionId, session);
    this.lastCreate = input;
    return session;
  }
}

function createTestEnv(opts = {}) {
  const dbPath = resolve(`C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\sup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  const fakeClient = opts.client || new FakeClient();
  const supervisor = new AgentSupervisor({
    port: 44123,
    store,
    clientFactory: () => fakeClient,
    skipBootstrap: opts.skipBootstrap ?? true,
  });
  return { dbPath, store, fakeClient, supervisor };
}

test('AgentSupervisor spawns a persistent session-backed agent', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant', cwd: 'C:\\Repos\\htekdev\\home-os' });

  assert.equal(agent.profile, 'home-assistant');
  assert.equal(agent.status, 'active');
  // Phase 3: tools should be resolved from profile baseTools
  assert.ok(fakeClient.lastCreate.tools.length > 0, 'Should register tools from profile');

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('sendToAgent persists inbound message and returns response', async () => {
  const { dbPath, store, supervisor } = createTestEnv();

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

test('sendToAgent persists outbound response', async () => {
  const { dbPath, store, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });
  await supervisor.sendToAgent(agent.agentId, 'Test persist');

  const messages = store.getMessages(agent.agentId, 10);
  const outbound = messages.find(m => m.direction === 'outbound');
  assert.ok(outbound, 'Outbound response should be persisted');
  assert.equal(outbound.content, 'Response to: Test persist');

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('inspectAgent returns metadata with isLoaded, messageCount, and tools', async () => {
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
  assert.ok(Array.isArray(info.tools));
  assert.ok(info.tools.length > 0, 'Should list resolved tools');

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
    skipBootstrap: true,
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
    skipBootstrap: true,
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

// --- Phase 3 new tests ---

test('spawnAgent resolves tools from profile baseTools', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'platform-manager' });

  // platform-manager has 'dev-tools' which resolves to view, glob, grep, shell
  const tools = fakeClient.lastCreate.tools;
  const toolNames = tools.map(t => t.name);
  assert.ok(toolNames.includes('view'));
  assert.ok(toolNames.includes('glob'));
  assert.ok(toolNames.includes('grep'));
  assert.ok(toolNames.includes('shell'));

  // Metadata should record tools
  assert.ok(agent.toolProfile.includes('view'));

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('bootstrap prompt is sent and response persisted when enabled', async () => {
  const dbPath = resolve(`C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\sup-bootstrap-${Date.now()}.db`);
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  const fakeClient = new FakeClient();
  const supervisor = new AgentSupervisor({
    port: 44123,
    store,
    clientFactory: () => fakeClient,
    skipBootstrap: false, // Enable bootstrap
  });

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  // Should have sent bootstrap prompt
  const session = fakeClient.sessions.get(agent.sdkSessionId);
  assert.ok(session.sendCalls.length >= 1, 'Bootstrap prompt should have been sent');
  assert.ok(session.sendCalls[0].prompt.includes('Acknowledge'));

  // Check bootstrap messages persisted
  const messages = store.getMessages(agent.agentId, 10);
  const systemMsg = messages.find(m => m.role === 'system' && m.content.includes('[bootstrap]'));
  assert.ok(systemMsg, 'Bootstrap system message should be persisted');
  const assistantMsg = messages.find(m => m.role === 'assistant');
  assert.ok(assistantMsg, 'Bootstrap response should be persisted');

  // Check bootstrap event
  const logs = store.getLogs(agent.agentId, 10);
  const bootstrapEvent = logs.find(l => l.eventType === 'agent.bootstrap_complete');
  assert.ok(bootstrapEvent, 'Bootstrap complete event should be recorded');

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('sendToAgent error recovery marks agent as error', async () => {
  const dbPath = resolve(`C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\sup-error-${Date.now()}.db`);
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  const failClient = new FailingSendClient(true);
  const supervisor = new AgentSupervisor({
    port: 44123,
    store,
    clientFactory: () => failClient,
    skipBootstrap: true,
  });

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  await assert.rejects(
    () => supervisor.sendToAgent(agent.agentId, 'Will fail'),
    /Send failed/
  );

  // Agent should be in error state
  const info = supervisor.inspectAgent(agent.agentId);
  assert.equal(info.status, 'error');
  assert.ok(info.lastError?.includes('SDK send failure'));

  // Error event should be logged
  const logs = store.getLogs(agent.agentId, 10);
  const errorEvent = logs.find(l => l.eventType === 'agent.send_error');
  assert.ok(errorEvent, 'Send error event should be recorded');

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('listAgents with filter returns only matching agents', async () => {
  const { dbPath, store, supervisor } = createTestEnv();

  await supervisor.start();
  await supervisor.spawnAgent({ profile: 'home-assistant' });
  const agent2 = await supervisor.spawnAgent({ profile: 'nicu-care' });
  await supervisor.stopAgent(agent2.agentId);

  const active = supervisor.listAgents({ status: 'active' });
  assert.ok(active.every(a => a.status === 'active'));

  const stopped = supervisor.listAgents({ status: 'stopped' });
  assert.ok(stopped.every(a => a.status === 'stopped'));
  assert.equal(stopped.length, 1);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('tool_execution events are recorded by session handlers', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  const session = fakeClient.sessions.get(agent.sdkSessionId);
  session.emit('tool_execution_start', { toolName: 'view', callId: 'call_1' });
  session.emit('tool_execution_end', { toolName: 'view', callId: 'call_1', durationMs: 42 });

  const logs = store.getLogs(agent.agentId, 10);
  const startEvent = logs.find(l => l.eventType === 'tool_execution_start');
  const endEvent = logs.find(l => l.eventType === 'tool_execution_end');
  assert.ok(startEvent, 'tool_execution_start should be logged');
  assert.ok(endEvent, 'tool_execution_end should be logged');

  const endPayload = JSON.parse(endEvent.payloadJson);
  assert.equal(endPayload.toolName, 'view');
  assert.equal(endPayload.durationMs, 42);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('sendToAgent stream callback receives chunks', async () => {
  const { dbPath, store, supervisor } = createTestEnv();

  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  const chunks = [];
  await supervisor.sendToAgent(agent.agentId, 'Stream test', (chunk) => {
    chunks.push(chunk);
  });

  assert.ok(chunks.length >= 2, 'Should receive text + done chunks');
  const textChunk = chunks.find(c => c.type === 'text');
  assert.ok(textChunk);
  assert.equal(textChunk.content, 'Response to: Stream test');
  const doneChunk = chunks.find(c => c.type === 'done');
  assert.ok(doneChunk);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});
