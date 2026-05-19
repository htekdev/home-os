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
  mcpServers?: McpServerConfig[];
}

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface SpawnAgentRequest {
  profile: string;
  cwd?: string;
  label?: string;
  model?: string;
}

export interface AgentStats {
  agentId: string;
  profile: string;
  status: AgentStatus;
  uptimeMs: number;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  toolCallCount: number;
  lastActiveAt: string;
  createdAt: string;
  estimatedMemoryKb: number;
}

export interface AgentHealthInfo {
  agentId: string;
  profile: string;
  status: AgentStatus;
  isLoaded: boolean;
  lastActiveAt: string;
  messageCount: number;
  estimatedMemoryKb: number;
  lastError: string | null;
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
  agents?: AgentHealthInfo[];
  totalMemoryKb?: number;
}

export interface ProfileValidationError {
  file: string;
  field: string;
  message: string;
}

export interface ProfileValidationResult {
  valid: boolean;
  profile: AgentProfile | null;
  errors: ProfileValidationError[];
}
