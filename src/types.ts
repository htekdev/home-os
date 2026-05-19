export type AgentStatus = 'active' | 'idle' | 'stopped' | 'error' | 'orphaned';

export interface AgentRecord {
  agentId: string;
  profile: string;
  label: string | null;
  sdkSessionId: string;
  cwd: string;
  status: AgentStatus;
  model: string | null;
  toolProfile: string | null;
  mcpProfile: string | null;
  createdAt: string;
  lastActiveAt: string;
  stoppedAt: string | null;
  lastError: string | null;
  metadataJson: string | null;
}

export interface AgentEventRecord {
  eventId?: number;
  agentId: string;
  sdkSessionId: string;
  eventType: string;
  payloadJson: string | null;
  createdAt: string;
}

export interface AgentMessageRecord {
  messageId?: number;
  agentId: string;
  direction: 'inbound' | 'outbound';
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  createdAt: string;
  correlationId: string | null;
}

export interface AgentProfile {
  name: string;
  description: string;
  systemPrompt: string;
  defaultModel?: string;
  cwd?: string;
  bootstrapPrompt?: string;
  baseTools: string[];
  customTools?: string[];
  mcpProfile?: string;
}

export interface SpawnAgentRequest {
  profile: string;
  cwd?: string;
  label?: string;
  model?: string;
}

export interface DaemonStatus {
  ok: boolean;
  port: number;
  startedAt: string;
  sdkReady: boolean;
  activeAgents: number;
  runtimeRoot: string;
  dbPath: string;
  lastError: string | null;
}
