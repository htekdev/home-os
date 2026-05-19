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
  constructor() { this.sessions = new Map(); }
  async start() {}
  async stop() {}
  async createSession(input) {
    const session = new FakeSession(input.sessionId);
    this.sessions.set(input.sessionId, session);
    return session;
  }
  async resumeSession(sessionId) {
    const session = new FakeSession(sessionId);
    this.sessions.set(sessionId, session);
    return session;
  }
  async deleteSession() {}
}

function createTestEnv() {
  const dbPath = resolve(`C:\\Repos\\htekdev\\home-os\\workdir\\feat--home-os-phase1\\tests\\fixtures\\phase4-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.db`);
  rmSync(dbPath, { force: true });
  const store = new HomeOsStore(dbPath);
  const fakeClient = new FakeClient();
  const supervisor = new AgentSupervisor({
    port: 44123,
    store,
    clientFactory: () => fakeClient,
    skipBootstrap: true,
  });
  return { dbPath, store, fakeClient, supervisor };
}

// --- Agent-to-Agent Messaging Tests ---

test('sendAgentMessage delivers IPC between two live agents', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();

  const agent1 = await supervisor.spawnAgent({ profile: 'home-assistant', label: 'sender' });
  const agent2 = await supervisor.spawnAgent({ profile: 'nicu-care', label: 'receiver' });

  const result = await supervisor.sendAgentMessage(agent1.agentId, agent2.agentId, 'Hello from agent1');
  assert.ok(result.ipcId > 0);

  // Check that the message was delivered (agent2 received a send call)
  // The IPC delivery sends a prompt to agent2's session
  const messages = store.getMessages(agent2.agentId, 10);
  const ipcMsg = messages.find(m => m.content.includes('[IPC from'));
  assert.ok(ipcMsg, 'IPC message should be delivered and recorded');
  assert.ok(ipcMsg.content.includes('Hello from agent1'));

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('sendAgentMessage throws for unknown source agent', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();
  await supervisor.spawnAgent({ profile: 'home-assistant' });

  await assert.rejects(
    () => supervisor.sendAgentMessage('nonexistent', 'home-assistant', 'hello'),
    /Unknown source agent/
  );

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('sendAgentMessage throws for unknown target agent', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();
  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });

  await assert.rejects(
    () => supervisor.sendAgentMessage(agent.agentId, 'nonexistent', 'hello'),
    /Unknown target agent/
  );

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

// --- Agent Stats Tests ---

test('getAgentStats returns message counts and tool calls', async () => {
  const { dbPath, store, fakeClient, supervisor } = createTestEnv();
  await supervisor.start();

  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });
  await supervisor.sendToAgent(agent.agentId, 'Hello');
  await supervisor.sendToAgent(agent.agentId, 'World');

  // Simulate tool events
  const session = fakeClient.sessions.get(agent.sdkSessionId);
  session.emit('tool_execution_start', { toolName: 'view', callId: 'c1' });
  session.emit('tool_execution_end', { toolName: 'view', callId: 'c1', durationMs: 10 });

  const stats = supervisor.getAgentStats(agent.agentId);
  assert.equal(stats.profile, 'home-assistant');
  assert.ok(stats.messageCount >= 4); // 2 inbound + 2 outbound
  assert.ok(stats.inboundCount >= 2);
  assert.ok(stats.outboundCount >= 2);
  assert.equal(stats.toolCallCount, 1);
  assert.ok(stats.uptimeMs >= 0);
  assert.ok(stats.estimatedMemoryKb >= 0);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('getAgentStats throws for unknown agent', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();

  assert.throws(
    () => supervisor.getAgentStats('nonexistent'),
    /Unknown agent/
  );

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

// --- Conversation History Tests ---

test('getConversationHistory returns messages in chronological order', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();

  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });
  await supervisor.sendToAgent(agent.agentId, 'First');
  await supervisor.sendToAgent(agent.agentId, 'Second');

  const history = supervisor.getConversationHistory(agent.agentId);
  assert.ok(history.length >= 4); // 2 inbound + 2 outbound at minimum

  // Verify chronological order (ASC)
  for (let i = 1; i < history.length; i++) {
    assert.ok(history[i].messageId >= history[i - 1].messageId, 'Messages should be in chronological order');
  }

  // Check first inbound is 'First'
  const firstInbound = history.find(m => m.content === 'First');
  assert.ok(firstInbound);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('getConversationHistory respects limit', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();

  const agent = await supervisor.spawnAgent({ profile: 'home-assistant' });
  await supervisor.sendToAgent(agent.agentId, 'msg1');
  await supervisor.sendToAgent(agent.agentId, 'msg2');
  await supervisor.sendToAgent(agent.agentId, 'msg3');

  const history = supervisor.getConversationHistory(agent.agentId, 3);
  assert.ok(history.length <= 3);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

// --- Enhanced Health Status ---

test('getStatus with includeAgentHealth returns per-agent health info', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();

  await supervisor.spawnAgent({ profile: 'home-assistant' });
  await supervisor.spawnAgent({ profile: 'nicu-care' });

  const status = supervisor.getStatus(true);
  assert.ok(status.agents);
  assert.ok(status.agents.length >= 2, `Expected at least 2 agents, got ${status.agents.length}`);
  assert.ok(status.totalMemoryKb !== undefined);

  for (const agentHealth of status.agents) {
    assert.ok(agentHealth.agentId);
    assert.ok(agentHealth.profile);
    assert.ok(agentHealth.status);
    assert.ok('isLoaded' in agentHealth);
    assert.ok('messageCount' in agentHealth);
    assert.ok('estimatedMemoryKb' in agentHealth);
  }

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});

test('getStatus without detailed flag omits agent health', async () => {
  const { dbPath, store, supervisor } = createTestEnv();
  await supervisor.start();

  const status = supervisor.getStatus(false);
  assert.equal(status.agents, undefined);
  assert.equal(status.totalMemoryKb, undefined);

  await supervisor.shutdown();
  store.close();
  rmSync(dbPath, { force: true });
});
