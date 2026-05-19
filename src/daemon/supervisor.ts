import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { getProfile, enableHotReload, clearProfileCache } from '../profiles/index.js';
import { HomeOsStore } from '../store/db.js';
import { resolveTools, type ToolDefinition } from '../tools/index.js';
import type { AgentProfile, AgentRecord, AgentMessageRecord, AgentStats, AgentHealthInfo, DaemonStatus, SpawnAgentRequest } from '../types.js';
import { DB_PATH, HOME_OS_ROOT } from '../utils/paths.js';

export type EventSinkCallback = (event: { type: string; agentId: string; data: unknown; timestamp: string }) => void;

export type StreamChunkCallback = (chunk: { type: 'text' | 'tool_start' | 'tool_end' | 'done'; content?: string; toolName?: string }) => void;

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
  resumeSession?(sessionId: string, input?: Record<string, unknown>): Promise<CopilotSessionLike>;
  deleteSession?(sessionId: string): Promise<void>;
}

interface LiveAgentSession {
  agentId: string;
  profile: AgentProfile;
  sdkSession: CopilotSessionLike;
  tools: ToolDefinition[];
}

interface SupervisorOptions {
  port: number;
  store?: HomeOsStore;
  clientFactory?: () => CopilotClientLike;
  skipBootstrap?: boolean;
  enableHotReload?: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildAgentId(): string {
  return `agt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function buildSdkSessionId(profile: string): string {
  return `homeos-${profile}-${Date.now()}`;
}

const ESTIMATED_KB_PER_MESSAGE = 2; // rough estimate for memory tracking

export class AgentSupervisor {
  private readonly port: number;
  private readonly store: HomeOsStore;
  private readonly clientFactory: () => CopilotClientLike;
  private readonly liveAgents = new Map<string, LiveAgentSession>();
  private readonly attachSubscribers = new Map<string, Set<EventSinkCallback>>();
  private readonly skipBootstrap: boolean;
  private readonly hotReloadEnabled: boolean;
  private client: CopilotClientLike | null = null;
  private startedAt = nowIso();
  private lastError: string | null = null;
  private sdkReady = false;
  private hotReloadCleanup: (() => void) | null = null;

  constructor(options: SupervisorOptions) {
    this.port = options.port;
    this.store = options.store ?? new HomeOsStore();
    this.clientFactory = options.clientFactory ?? (() => new CopilotClient({}) as unknown as CopilotClientLike);
    this.skipBootstrap = options.skipBootstrap ?? false;
    this.hotReloadEnabled = options.enableHotReload ?? false;
  }

  async start(): Promise<void> {
    try {
      this.client = this.clientFactory();
      await this.client.start();
      this.sdkReady = true;
      this.lastError = null;
      // Attempt recovery of persisted agents
      await this.recoverAgents();
      // Enable hot-reload if configured
      if (this.hotReloadEnabled) {
        this.hotReloadCleanup = enableHotReload((profiles) => {
          this.store.recordEvent({
            agentId: 'daemon',
            sdkSessionId: 'system',
            eventType: 'profiles.reloaded',
            payloadJson: JSON.stringify({ count: profiles.length, names: profiles.map(p => p.name) }),
            createdAt: nowIso(),
          });
        });
      }
    } catch (error) {
      this.sdkReady = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  private async recoverAgents(): Promise<void> {
    const resumable = this.store.getResumableAgents();
    for (const record of resumable) {
      try {
        await this.resumeAgentInternal(record);
      } catch {
        // Mark as orphaned if resume fails
        this.store.updateAgentStatus(record.agentId, 'orphaned', 'Failed to resume on daemon startup');
        this.store.recordEvent({
          agentId: record.agentId,
          sdkSessionId: record.sdkSessionId,
          eventType: 'agent.recovery_failed',
          payloadJson: JSON.stringify({ reason: 'resume failed on daemon startup' }),
          createdAt: nowIso(),
        });
      }
    }
  }

  async shutdown(): Promise<void> {
    // Stop hot-reload watcher
    if (this.hotReloadCleanup) {
      this.hotReloadCleanup();
      this.hotReloadCleanup = null;
    }
    for (const [agentId, live] of this.liveAgents.entries()) {
      await live.sdkSession.disconnect();
      this.store.updateAgentStatus(agentId, 'orphaned');
    }
    this.liveAgents.clear();
    this.attachSubscribers.clear();
    if (this.client) {
      await this.client.stop();
      this.client = null;
    }
    this.sdkReady = false;
  }

  getStatus(includeAgentHealth = false): DaemonStatus {
    const status: DaemonStatus = {
      ok: true,
      port: this.port,
      startedAt: this.startedAt,
      sdkReady: this.sdkReady,
      activeAgents: this.liveAgents.size,
      runtimeRoot: HOME_OS_ROOT,
      dbPath: DB_PATH,
      lastError: this.lastError,
    };

    if (includeAgentHealth) {
      const agents = this.store.listAgents();
      status.agents = agents.map((a) => {
        const stats = this.store.getAgentStats(a.agentId);
        const memKb = stats.messageCount * ESTIMATED_KB_PER_MESSAGE;
        return {
          agentId: a.agentId,
          profile: a.profile,
          status: a.status as import('../types.js').AgentStatus,
          isLoaded: this.liveAgents.has(a.agentId),
          lastActiveAt: a.lastActiveAt,
          messageCount: stats.messageCount,
          estimatedMemoryKb: memKb,
          lastError: a.lastError,
        };
      });
      status.totalMemoryKb = status.agents.reduce((sum, a) => sum + a.estimatedMemoryKb, 0);
    }

    return status;
  }

  listAgents(filter?: { status?: string }): AgentRecord[] {
    const all = this.store.listAgents();
    if (!filter?.status) return all;
    return all.filter((a) => a.status === filter.status);
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

    // Resolve tools from profile
    const tools = resolveTools(profile.baseTools);
    const toolNames = tools.map((t) => t.name);

    const sdkSession = await this.client.createSession({
      sessionId,
      onPermissionRequest: approveAll,
      streaming: true,
      tools,
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
      toolProfile: toolNames.length > 0 ? toolNames.join(',') : 'none',
      mcpProfile: profile.mcpProfile ?? null,
      createdAt: now,
      lastActiveAt: now,
      stoppedAt: null,
      lastError: null,
      metadataJson: JSON.stringify({ description: profile.description, tools: toolNames }),
    };

    this.attachSessionHandlers(record.agentId, sdkSession);
    this.liveAgents.set(record.agentId, { agentId, profile, sdkSession, tools });
    this.store.upsertAgent(record);
    this.store.recordEvent({
      agentId: record.agentId,
      sdkSessionId: record.sdkSessionId,
      eventType: 'agent.spawned',
      payloadJson: JSON.stringify({ profile: record.profile, cwd: record.cwd, tools: toolNames }),
      createdAt: now,
    });

    // Bootstrap prompt — send initial message if profile has one
    if (!this.skipBootstrap && profile.bootstrapPrompt) {
      try {
        const bootstrapResult = await sdkSession.send({ prompt: profile.bootstrapPrompt, mode: 'enqueue' });
        const bootstrapResponse = typeof bootstrapResult === 'string'
          ? bootstrapResult
          : (bootstrapResult && typeof bootstrapResult === 'object' && 'content' in bootstrapResult)
            ? String((bootstrapResult as { content?: unknown }).content ?? '')
            : null;

        this.store.recordMessage({
          agentId: record.agentId,
          direction: 'inbound',
          role: 'system',
          content: `[bootstrap] ${profile.bootstrapPrompt}`,
          createdAt: nowIso(),
          correlationId: null,
        });

        if (bootstrapResponse) {
          this.store.recordMessage({
            agentId: record.agentId,
            direction: 'outbound',
            role: 'assistant',
            content: bootstrapResponse,
            createdAt: nowIso(),
            correlationId: null,
          });
        }

        this.store.recordEvent({
          agentId: record.agentId,
          sdkSessionId: record.sdkSessionId,
          eventType: 'agent.bootstrap_complete',
          payloadJson: JSON.stringify({ response: bootstrapResponse?.slice(0, 200) }),
          createdAt: nowIso(),
        });
      } catch (err) {
        // Bootstrap failure is non-fatal
        this.store.recordEvent({
          agentId: record.agentId,
          sdkSessionId: record.sdkSessionId,
          eventType: 'agent.bootstrap_failed',
          payloadJson: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
          createdAt: nowIso(),
        });
      }
    }

    return record;
  }

  async sendToAgent(identifier: string, prompt: string, streamCallback?: StreamChunkCallback): Promise<{ agentId: string; response: string | null }> {
    const live = this.resolveLiveAgent(identifier);
    if (!live) {
      throw new Error(`Agent not found or not loaded: ${identifier}`);
    }

    const now = nowIso();
    this.store.recordMessage({
      agentId: live.agentId,
      direction: 'inbound',
      role: 'user',
      content: prompt,
      createdAt: now,
      correlationId: null,
    });

    this.store.updateAgentStatus(live.agentId, 'active');
    this.store.recordEvent({
      agentId: live.agentId,
      sdkSessionId: this.store.findAgent(live.agentId)?.sdkSessionId ?? '',
      eventType: 'message.sent',
      payloadJson: JSON.stringify({ prompt: prompt.slice(0, 200) }),
      createdAt: now,
    });

    try {
      const result = await live.sdkSession.send({ prompt, mode: 'enqueue' });
      const responseText = typeof result === 'string' ? result :
        (result && typeof result === 'object' && 'content' in result) ? String((result as { content?: unknown }).content ?? '') : null;

      // Persist outbound response
      if (responseText) {
        this.store.recordMessage({
          agentId: live.agentId,
          direction: 'outbound',
          role: 'assistant',
          content: responseText,
          createdAt: nowIso(),
          correlationId: null,
        });
      }

      // Stream callback for streaming send
      if (streamCallback) {
        if (responseText) {
          streamCallback({ type: 'text', content: responseText });
        }
        streamCallback({ type: 'done' });
      }

      return { agentId: live.agentId, response: responseText };
    } catch (err) {
      // Error recovery — mark agent as error, record it, expose in inspect
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.store.updateAgentStatus(live.agentId, 'error', errorMsg);
      this.store.recordEvent({
        agentId: live.agentId,
        sdkSessionId: this.store.findAgent(live.agentId)?.sdkSessionId ?? '',
        eventType: 'agent.send_error',
        payloadJson: JSON.stringify({ error: errorMsg, prompt: prompt.slice(0, 200) }),
        createdAt: nowIso(),
      });
      this.notifySubscribers(live.agentId, 'agent.error', { error: errorMsg });

      if (streamCallback) {
        streamCallback({ type: 'done' });
      }

      throw new Error(`Send failed for ${live.agentId}: ${errorMsg}`);
    }
  }

  inspectAgent(identifier: string): AgentRecord & { isLoaded: boolean; messageCount: number; tools: string[] } {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }

    const isLoaded = this.liveAgents.has(agent.agentId);
    const messages = this.store.getMessages(agent.agentId, 1000);
    const live = this.liveAgents.get(agent.agentId);
    const tools = live ? live.tools.map((t) => t.name) : [];

    return {
      ...agent,
      isLoaded,
      messageCount: messages.length,
      tools,
    };
  }

  getRecentOutput(identifier: string, limit = 10): AgentMessageRecord[] {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }
    return this.store.getRecentOutput(agent.agentId, limit);
  }

  attach(agentId: string, sink: EventSinkCallback): () => void {
    const agent = this.store.findAgent(agentId);
    if (!agent) {
      throw new Error(`Unknown agent: ${agentId}`);
    }
    const resolvedId = agent.agentId;
    if (!this.attachSubscribers.has(resolvedId)) {
      this.attachSubscribers.set(resolvedId, new Set());
    }
    this.attachSubscribers.get(resolvedId)!.add(sink);
    // Return detach function
    return () => {
      this.attachSubscribers.get(resolvedId)?.delete(sink);
    };
  }

  async resumeAgent(identifier: string): Promise<AgentRecord> {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }

    if (this.liveAgents.has(agent.agentId)) {
      // Already loaded — just return
      return agent;
    }

    if (agent.status === 'stopped') {
      throw new Error(`Cannot resume a stopped agent. Spawn a new one instead.`);
    }

    return this.resumeAgentInternal(agent);
  }

  private async resumeAgentInternal(record: AgentRecord): Promise<AgentRecord> {
    if (!this.client) {
      throw new Error('Copilot client is not started.');
    }

    const profile = getProfile(record.profile);
    if (!profile) {
      throw new Error(`Unknown profile for resume: ${record.profile}`);
    }

    const tools = resolveTools(profile.baseTools);
    let sdkSession: CopilotSessionLike;

    if (this.client.resumeSession) {
      sdkSession = await this.client.resumeSession(record.sdkSessionId, {
        onPermissionRequest: approveAll,
        streaming: true,
        tools,
        systemMessage: { content: profile.systemPrompt },
      });
    } else {
      // Fallback: create a new session with the same ID
      sdkSession = await this.client.createSession({
        sessionId: record.sdkSessionId,
        onPermissionRequest: approveAll,
        streaming: true,
        tools,
        systemMessage: { content: profile.systemPrompt },
        infiniteSessions: {
          enabled: true,
          backgroundCompactionThreshold: 0.8,
          bufferExhaustionThreshold: 0.95,
        },
      });
    }

    this.attachSessionHandlers(record.agentId, sdkSession);
    this.liveAgents.set(record.agentId, { agentId: record.agentId, profile, sdkSession, tools });
    this.store.updateAgentStatus(record.agentId, 'idle');
    this.store.recordEvent({
      agentId: record.agentId,
      sdkSessionId: record.sdkSessionId,
      eventType: 'agent.resumed',
      payloadJson: JSON.stringify({ profile: record.profile }),
      createdAt: nowIso(),
    });

    return this.store.findAgent(record.agentId)!;
  }

  getLogs(identifier: string, limit = 20) {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }
    return this.store.getLogs(agent.agentId, limit);
  }

  // --- Phase 4: Agent-to-Agent Messaging ---

  async sendAgentMessage(fromIdentifier: string, toIdentifier: string, content: string): Promise<{ ipcId: number }> {
    const fromAgent = this.store.findAgent(fromIdentifier);
    if (!fromAgent) {
      throw new Error(`Unknown source agent: ${fromIdentifier}`);
    }
    const toAgent = this.store.findAgent(toIdentifier);
    if (!toAgent) {
      throw new Error(`Unknown target agent: ${toIdentifier}`);
    }

    const ipcId = this.store.sendIpcMessage(fromAgent.agentId, toAgent.agentId, content);

    this.store.recordEvent({
      agentId: fromAgent.agentId,
      sdkSessionId: fromAgent.sdkSessionId,
      eventType: 'ipc.sent',
      payloadJson: JSON.stringify({ to: toAgent.agentId, ipcId }),
      createdAt: nowIso(),
    });

    // If target is live, deliver immediately
    await this.deliverPendingIpc(toAgent.agentId);

    return { ipcId };
  }

  private async deliverPendingIpc(agentId: string): Promise<void> {
    const live = this.liveAgents.get(agentId);
    if (!live) return;

    const pending = this.store.getPendingIpcMessages(agentId);
    for (const msg of pending) {
      try {
        const ipcPrompt = `[IPC from ${msg.fromAgent}]: ${msg.content}`;
        await live.sdkSession.send({ prompt: ipcPrompt, mode: 'enqueue' });

        this.store.recordMessage({
          agentId,
          direction: 'inbound',
          role: 'system',
          content: ipcPrompt,
          createdAt: nowIso(),
          correlationId: `ipc_${msg.ipcId}`,
        });

        this.store.markIpcDelivered(msg.ipcId);

        this.store.recordEvent({
          agentId,
          sdkSessionId: live.sdkSession.sessionId,
          eventType: 'ipc.delivered',
          payloadJson: JSON.stringify({ from: msg.fromAgent, ipcId: msg.ipcId }),
          createdAt: nowIso(),
        });
      } catch {
        // Delivery failure — message remains pending for retry
      }
    }
  }

  // --- Phase 4: Agent Stats/Metrics ---

  getAgentStats(identifier: string): AgentStats {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }

    const stats = this.store.getAgentStats(agent.agentId);
    const createdMs = new Date(agent.createdAt).getTime();
    const endMs = agent.stoppedAt ? new Date(agent.stoppedAt).getTime() : Date.now();
    const uptimeMs = endMs - createdMs;
    const estimatedMemoryKb = stats.messageCount * ESTIMATED_KB_PER_MESSAGE;

    return {
      agentId: agent.agentId,
      profile: agent.profile,
      status: agent.status as import('../types.js').AgentStatus,
      uptimeMs,
      messageCount: stats.messageCount,
      inboundCount: stats.inboundCount,
      outboundCount: stats.outboundCount,
      toolCallCount: stats.toolCallCount,
      lastActiveAt: agent.lastActiveAt,
      createdAt: agent.createdAt,
      estimatedMemoryKb,
    };
  }

  // --- Phase 4: Conversation History ---

  getConversationHistory(identifier: string, limit = 100): AgentMessageRecord[] {
    const agent = this.store.findAgent(identifier);
    if (!agent) {
      throw new Error(`Unknown agent: ${identifier}`);
    }
    return this.store.getConversationHistory(agent.agentId, limit);
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
    this.attachSubscribers.delete(agent.agentId);

    if (deleteSession && this.client?.deleteSession) {
      await this.client.deleteSession(agent.sdkSessionId);
    }

    this.store.updateAgentStatus(agent.agentId, 'stopped');
    this.store.recordEvent({
      agentId: agent.agentId,
      sdkSessionId: agent.sdkSessionId,
      eventType: 'agent.stopped',
      payloadJson: JSON.stringify({ deleteSession }),
      createdAt: nowIso(),
    });

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

  private notifySubscribers(agentId: string, type: string, data: unknown): void {
    const subs = this.attachSubscribers.get(agentId);
    if (!subs || subs.size === 0) return;
    const event = { type, agentId, data, timestamp: nowIso() };
    for (const sink of subs) {
      try {
        sink(event);
      } catch {
        // Don't let a bad subscriber crash the daemon
      }
    }
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
      this.notifySubscribers(agentId, 'assistant.message', { content });
    });

    // Tool execution lifecycle events — Phase 3
    session.on?.('tool_execution_start', (event: unknown) => {
      const payload = event as { toolName?: string; callId?: string } | null;
      const toolName = payload?.toolName ?? 'unknown';
      const agent = this.store.findAgent(agentId);
      if (!agent) return;

      this.store.recordEvent({
        agentId,
        sdkSessionId: agent.sdkSessionId,
        eventType: 'tool_execution_start',
        payloadJson: JSON.stringify({ toolName, callId: payload?.callId }),
        createdAt: nowIso(),
      });
      this.notifySubscribers(agentId, 'tool_execution_start', { toolName });
    });

    session.on?.('tool_execution_end', (event: unknown) => {
      const payload = event as { toolName?: string; callId?: string; durationMs?: number } | null;
      const toolName = payload?.toolName ?? 'unknown';
      const agent = this.store.findAgent(agentId);
      if (!agent) return;

      this.store.recordEvent({
        agentId,
        sdkSessionId: agent.sdkSessionId,
        eventType: 'tool_execution_end',
        payloadJson: JSON.stringify({ toolName, callId: payload?.callId, durationMs: payload?.durationMs }),
        createdAt: nowIso(),
      });
      this.notifySubscribers(agentId, 'tool_execution_end', { toolName, durationMs: payload?.durationMs });
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
      this.notifySubscribers(agentId, 'session.idle', {});
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
      this.notifySubscribers(agentId, 'session.error', event);
    });
  }
}
