import Database from 'better-sqlite3';
import type { AgentEventRecord, AgentMessageRecord, AgentRecord, AgentStatus } from '../types.js';
import { DB_PATH, ensureRuntimeDir } from '../utils/paths.js';

function nowIso(): string {
  return new Date().toISOString();
}

export class HomeOsStore {
  private readonly db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    ensureRuntimeDir();
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.initialize();
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        profile TEXT NOT NULL,
        label TEXT,
        sdk_session_id TEXT NOT NULL,
        cwd TEXT NOT NULL,
        status TEXT NOT NULL,
        model TEXT,
        tool_profile TEXT,
        mcp_profile TEXT,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL,
        stopped_at TEXT,
        last_error TEXT,
        metadata_json TEXT
      );

      CREATE TABLE IF NOT EXISTS agent_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        sdk_session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_messages (
        message_id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        direction TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        correlation_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_messages_agent ON agent_messages(agent_id, created_at DESC);
    `);
  }

  getDbPath(): string {
    return this.db.name;
  }

  upsertAgent(record: AgentRecord): AgentRecord {
    const stmt = this.db.prepare(`
      INSERT INTO agents (
        agent_id, profile, label, sdk_session_id, cwd, status, model, tool_profile, mcp_profile,
        created_at, last_active_at, stopped_at, last_error, metadata_json
      ) VALUES (
        @agentId, @profile, @label, @sdkSessionId, @cwd, @status, @model, @toolProfile, @mcpProfile,
        @createdAt, @lastActiveAt, @stoppedAt, @lastError, @metadataJson
      )
      ON CONFLICT(agent_id) DO UPDATE SET
        profile = excluded.profile,
        label = excluded.label,
        sdk_session_id = excluded.sdk_session_id,
        cwd = excluded.cwd,
        status = excluded.status,
        model = excluded.model,
        tool_profile = excluded.tool_profile,
        mcp_profile = excluded.mcp_profile,
        last_active_at = excluded.last_active_at,
        stopped_at = excluded.stopped_at,
        last_error = excluded.last_error,
        metadata_json = excluded.metadata_json
    `);

    stmt.run(record);
    return record;
  }

  listAgents(): AgentRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        agent_id as agentId,
        profile,
        label,
        sdk_session_id as sdkSessionId,
        cwd,
        status,
        model,
        tool_profile as toolProfile,
        mcp_profile as mcpProfile,
        created_at as createdAt,
        last_active_at as lastActiveAt,
        stopped_at as stoppedAt,
        last_error as lastError,
        metadata_json as metadataJson
      FROM agents
      ORDER BY created_at DESC
    `);

    return stmt.all() as AgentRecord[];
  }

  findAgent(identifier: string): AgentRecord | null {
    const stmt = this.db.prepare(`
      SELECT
        agent_id as agentId,
        profile,
        label,
        sdk_session_id as sdkSessionId,
        cwd,
        status,
        model,
        tool_profile as toolProfile,
        mcp_profile as mcpProfile,
        created_at as createdAt,
        last_active_at as lastActiveAt,
        stopped_at as stoppedAt,
        last_error as lastError,
        metadata_json as metadataJson
      FROM agents
      WHERE agent_id = ? OR profile = ? OR label = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return (stmt.get(identifier, identifier, identifier) as AgentRecord | undefined) ?? null;
  }

  updateAgentStatus(agentId: string, status: AgentStatus, lastError: string | null = null): void {
    const stoppedAt = status === 'stopped' ? nowIso() : null;
    const stmt = this.db.prepare(`
      UPDATE agents
      SET status = ?, last_active_at = ?, stopped_at = COALESCE(?, stopped_at), last_error = ?
      WHERE agent_id = ?
    `);
    stmt.run(status, nowIso(), stoppedAt, lastError, agentId);
  }

  recordEvent(event: AgentEventRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_events (agent_id, sdk_session_id, event_type, payload_json, created_at)
      VALUES (@agentId, @sdkSessionId, @eventType, @payloadJson, @createdAt)
    `);
    stmt.run(event);
  }

  recordMessage(message: AgentMessageRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO agent_messages (agent_id, direction, role, content, created_at, correlation_id)
      VALUES (@agentId, @direction, @role, @content, @createdAt, @correlationId)
    `);
    stmt.run(message);
  }

  getLogs(agentId: string, limit = 20): AgentEventRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        event_id as eventId,
        agent_id as agentId,
        sdk_session_id as sdkSessionId,
        event_type as eventType,
        payload_json as payloadJson,
        created_at as createdAt
      FROM agent_events
      WHERE agent_id = ?
      ORDER BY event_id DESC
      LIMIT ?
    `);
    return stmt.all(agentId, limit) as AgentEventRecord[];
  }

  getMessages(agentId: string, limit = 50): AgentMessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        message_id as messageId,
        agent_id as agentId,
        direction,
        role,
        content,
        created_at as createdAt,
        correlation_id as correlationId
      FROM agent_messages
      WHERE agent_id = ?
      ORDER BY message_id DESC
      LIMIT ?
    `);
    return stmt.all(agentId, limit) as AgentMessageRecord[];
  }

  getRecentOutput(agentId: string, limit = 10): AgentMessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        message_id as messageId,
        agent_id as agentId,
        direction,
        role,
        content,
        created_at as createdAt,
        correlation_id as correlationId
      FROM agent_messages
      WHERE agent_id = ? AND direction = 'outbound'
      ORDER BY message_id DESC
      LIMIT ?
    `);
    return stmt.all(agentId, limit) as AgentMessageRecord[];
  }

  getResumableAgents(): AgentRecord[] {
    const stmt = this.db.prepare(`
      SELECT
        agent_id as agentId,
        profile,
        label,
        sdk_session_id as sdkSessionId,
        cwd,
        status,
        model,
        tool_profile as toolProfile,
        mcp_profile as mcpProfile,
        created_at as createdAt,
        last_active_at as lastActiveAt,
        stopped_at as stoppedAt,
        last_error as lastError,
        metadata_json as metadataJson
      FROM agents
      WHERE status IN ('active', 'idle', 'orphaned')
      ORDER BY last_active_at DESC
    `);
    return stmt.all() as AgentRecord[];
  }

  close(): void {
    this.db.close();
  }
}
