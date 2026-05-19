import type { AgentEventRecord, AgentRecord, AgentMessageRecord, DaemonStatus } from '../types.js';

const DEFAULT_PORT = 44123;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${DEFAULT_PORT}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
    throw new Error(String(payload.error ?? response.statusText));
  }

  return response.json() as Promise<T>;
}

export async function getDaemonStatus(): Promise<DaemonStatus> {
  return request<DaemonStatus>('/health');
}

export async function listAgents(): Promise<{ agents: AgentRecord[] }> {
  return request<{ agents: AgentRecord[] }>('/agents');
}

export async function spawnAgent(body: { profile: string; cwd?: string; label?: string; model?: string }): Promise<{ agent: AgentRecord }> {
  return request<{ agent: AgentRecord }>('/agents/spawn', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function sendToAgent(agentId: string, prompt: string): Promise<{ ok: boolean; agentId: string; response: string | null }> {
  return request<{ ok: boolean; agentId: string; response: string | null }>(`/agents/${encodeURIComponent(agentId)}/send`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });
}

export async function inspectAgent(agentId: string): Promise<{ agent: AgentRecord & { isLoaded: boolean; messageCount: number } }> {
  return request<{ agent: AgentRecord & { isLoaded: boolean; messageCount: number } }>(`/agents/${encodeURIComponent(agentId)}/inspect`);
}

export async function resumeAgent(agentId: string): Promise<{ agent: AgentRecord }> {
  return request<{ agent: AgentRecord }>(`/agents/${encodeURIComponent(agentId)}/resume`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getAgentLogs(agentId: string, limit = 20): Promise<{ logs: AgentEventRecord[] }> {
  return request<{ logs: AgentEventRecord[] }>(`/agents/${encodeURIComponent(agentId)}/logs?limit=${limit}`);
}

export async function stopAgent(agentId: string, deleteSession = false) {
  return request(`/agents/${encodeURIComponent(agentId)}/stop`, {
    method: 'POST',
    body: JSON.stringify({ deleteSession }),
  });
}

export async function stopDaemon() {
  return request('/shutdown', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export function getAttachUrl(agentId: string, replay = true, replayLimit = 10): string {
  return `http://127.0.0.1:${DEFAULT_PORT}/agents/${encodeURIComponent(agentId)}/attach?replay=${replay}&replay_limit=${replayLimit}`;
}
