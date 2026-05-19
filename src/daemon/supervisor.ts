import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { getProfile } from '../profiles/index.js';
import { HomeOsStore } from '../store/db.js';
import type { AgentProfile, AgentRecord, DaemonStatus, SpawnAgentRequest } from '../types.js';
import { DB_PATH, HOME_OS_ROOT } from '../utils/paths.js';

export interface CopilotSessionLike {
  sessionId: string;
  send(input: { prompt: string; mode?: string }): Promise<unknown>;
  disconnect(): Promise<void>;
  on?(event: string, listener: (payload: unknown) => void): void;
}

export interface CopilotClientLike {
  start(): Promise<void>;
  stop(): Promise<void>;
  createSession(input: Record<string, unknown>): Promise<CopilotSessionLike>;
  deleteSession?(sessionId: string): Promise<void>;
}

interface LiveAgentSession {
  agentId: string;
  profile: AgentProfile;
  sdkSession: CopilotSessionLike;
}

interface SupervisorOptions {
  port: number;
  store?: HomeOsStore;
  clientFactory?: () => CopilotClientLike;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildAgentId(): string {
  return `agt_${Date.now().toString(36)}`;
}

function buildSdkSessionId(profile: string): string {
  return `homeos-${profile}-${Date.now()}`;
}

export class AgentSupervisor {
  private readonly port: number;
  private readonly store: HomeOsStore;
  private readonly clientFactory: () => CopilotClientLike;
  private readonly liveAgents = new Map<string, LiveAgentSession>();
  private client: CopilotClientLike | null = null;
  private startedAt = nowIso();
  private lastError: string | null = null;
  private sdkReady = false;

  constructor(options: SupervisorOptions) {
    this.port = options.port;
    this.store = options.store ?? new HomeOsStore();
    this.clientFactory = options.clientFactory ?? (() => new CopilotClient({}) as unknown as CopilotClientLike);
  }

  async start(): Promise<void> {
    try {
      this.client = this.clientFactory();
      await this.client.start();
      this.sdkReady = true;
      this.lastError = null;
    } catch (error) {
      this.sdkReady = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    for (const [agentId, live] of this.liveAgents.entries()) {
      await live.sdkSession.disconnect();
      this.store.updateAgentStatus(agentId, 'stopped');
    }
    this.liveAgents.clear();
    if (this.client) {
      await this.client.stop();
      this.client = null;
    }
    this.sdkReady = false;
  }

  getStatus(): DaemonStatus {
    return {
      ok: true,
      port: this.port,
      startedAt: this.startedAt,
      sdkReady: this.sdkReady,
      activeAgents: this.liveAgents.size,
      runtimeRoot: HOME_OS_ROOT,
      dbPath: DB_PATH,
      lastError: this.lastError,
    };
  }

  listAgents(): AgentRecord[] {
    return this.store.listAgents();
  }

  async spawnAgent(request: SpawnAgentRequest): Promise<AgentRecord> {
    if (!this.client) {
      throw new Error('Copilot client is not started. Start the daemon first.');
    }

    const profile = getProfile(request.profile);
    if (!profile) {
      throw new Error(`Unknown profile: ${request.profile}`);
    }

    const agentId = buildAgentId();
    const sessionId = buildSdkSessionId(profile.name);
    const cwd = request.cwd ?? profile.cwd ?? HOME_OS_ROOT;
    const now = nowIso();

    const sdkSession = await this.client.createSession({
      sessionId,
      onPermissionRequest: approveAll,
      streaming: true,
      tools: [],
      systemMessage: { content: profile.systemPrompt },
      infiniteSessions: {
        enabled: true,
        backgroundCompactionThreshold: 0.8,
        bufferExhaustionThreshold: 0.95,
      },
    });

    const record: AgentRecord = {
      agentId,
      profile: profile.name,
      label: request.label ?? null,
      sdkSessionId: sdkSession.sessionId,
      cwd,
      status: 'active',
      model: request.model ?? profile.defaultModel ?? null,
      toolProfile: 'phase1-base',
      mcpProfile: profile.mcpProfile ?? null,
      createdAt: now,
      lastActiveAt: now,
      stoppedAt: null,
      lastError: null,
      metadataJson: JSON.stringify({ description: profile.description }),
    };

    this.attachSessionHandlers(record.agentId, sdkSession);
    this.liveAgents.set(record.agentId, { agentId, profile, sdkSession });
    this.store.upsertAgent(record);
    this.store.recordEvent({
      agentId: record.agentId,
      sdkSessionId: record.sdkSessionId,
      eventType: 'agent.spawned',
      payloadJson: JSON.stringify({ profile: record.profile, cwd: record.cwd }),
      createdAt: now,
    });

    return record;
  }

  async sendToAgent(identifier: string, prompt: string): Promise<void> {
    const live = this.resolveLiveAgent(identifier);
    if (!live) {
      throw new Error(`Agent not found or not loaded: ${identifier}`);
    }

    this.store.recordMessage({
      agentId: live.agentId,
      direction: 'inbound',
      role: 'user',
      content: prompt,
      createdAt: nowIso(),
      correlationId: null,
    });

    await live.sdkSession.send({ prompt, mode: 'enqueue' });
  }

  getLogs(identifier: string, limit = 20) {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }
    return this.store.getLogs(agent.agentId, limit);
  }

  async stopAgent(identifier: string, deleteSession = false): Promise<AgentRecord> {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }

    const live = this.liveAgents.get(agent.agentId);
    if (live) {
      await live.sdkSession.disconnect();
      this.liveAgents.delete(agent.agentId);
    }

    if (deleteSession && this.client?.deleteSession) {
      await this.client.deleteSession(agent.sdkSessionId);
    }

    this.store.updateAgentStatus(agent.agentId, 'stopped');
    const updated = this.store.findAgent(agent.agentId);
    if (!updated) {
      throw new Error(`Agent disappeared during stop: ${agent.agentId}`);
    }
    return updated;
  }

  private resolveLiveAgent(identifier: string): LiveAgentSession | null {
    const direct = this.liveAgents.get(identifier);
    if (direct) {
      return direct;
    }

    const found = this.store.findAgent(identifier);
    if (!found) {
      return null;
    }

    return this.liveAgents.get(found.agentId) ?? null;
  }

  private attachSessionHandlers(agentId: string, session: CopilotSessionLike): void {
    session.on?.('assistant.message', (event: unknown) => {
      const content = typeof event === 'object' && event !== null && 'data' in event
        ? String((event as { data?: { content?: string } }).data?.content ?? '')
        : '';
      if (!content.trim()) {
        return;
      }

      const agent = this.store.findAgent(agentId);
      if (!agent) {
        return;
      }

      this.store.recordMessage({
        agentId,
        direction: 'outbound',
        role: 'assistant',
        content,
        createdAt: nowIso(),
        correlationId: null,
      });
      this.store.recordEvent({
        agentId,
        sdkSessionId: agent.sdkSessionId,
        eventType: 'assistant.message',
        payloadJson: JSON.stringify({ content }),
        createdAt: nowIso(),
      });
    });

    session.on?.('session.idle', () => {
      this.store.updateAgentStatus(agentId, 'idle');
      const agent = this.store.findAgent(agentId);
      if (!agent) {
        return;
      }
      this.store.recordEvent({
        agentId,
        sdkSessionId: agent.sdkSessionId,
        eventType: 'session.idle',
        payloadJson: null,
        createdAt: nowIso(),
      });
    });

    session.on?.('session.error', (event: unknown) => {
      const payload = JSON.stringify(event ?? {});
      const agent = this.store.findAgent(agentId);
      if (!agent) {
        return;
      }
      this.store.updateAgentStatus(agentId, 'error', payload);
      this.store.recordEvent({
        agentId,
        sdkSessionId: agent.sdkSessionId,
        eventType: 'session.error',
        payloadJson: payload,
        createdAt: nowIso(),
      });
    });
  }
}
