import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { URL } from 'node:url';
import type { AgentSupervisor } from '../daemon/supervisor.js';

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function sendSSE(response: ServerResponse, event: string, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createIpcServer(supervisor: AgentSupervisor, port: number) {
  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

      if (method === 'GET' && url.pathname === '/health') {
        const detailed = url.searchParams.get('detailed') === 'true';
        sendJson(response, 200, supervisor.getStatus(detailed));
        return;
      }

      if (method === 'GET' && url.pathname === '/agents') {
        const statusFilter = url.searchParams.get('status') ?? undefined;
        const filter = statusFilter ? { status: statusFilter } : undefined;
        sendJson(response, 200, { agents: supervisor.listAgents(filter) });
        return;
      }

      if (method === 'POST' && url.pathname === '/agents/spawn') {
        const body = await readBody(request) as { profile: string; cwd?: string; label?: string; model?: string };
        const agent = await supervisor.spawnAgent(body);
        sendJson(response, 201, { agent });
        return;
      }

      if (method === 'POST' && url.pathname.match(/^\/agents\/[^/]+\/send$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const body = await readBody(request) as { prompt: string; stream?: boolean };

        if (body.stream) {
          // Streaming send — SSE response
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            'connection': 'keep-alive',
          });

          try {
            const result = await supervisor.sendToAgent(identifier, body.prompt, (chunk) => {
              sendSSE(response, chunk.type, chunk);
            });
            sendSSE(response, 'result', { agentId: result.agentId, response: result.response });
          } catch (err) {
            sendSSE(response, 'error', { error: err instanceof Error ? err.message : String(err) });
          }
          response.end();
        } else {
          const result = await supervisor.sendToAgent(identifier, body.prompt);
          sendJson(response, 200, { ok: true, agentId: result.agentId, response: result.response });
        }
        return;
      }

      if (method === 'GET' && url.pathname.match(/^\/agents\/[^/]+\/inspect$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const info = supervisor.inspectAgent(identifier);
        sendJson(response, 200, { agent: info });
        return;
      }

      if (method === 'GET' && url.pathname.match(/^\/agents\/[^/]+\/stats$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const stats = supervisor.getAgentStats(identifier);
        sendJson(response, 200, { stats });
        return;
      }

      if (method === 'GET' && url.pathname.match(/^\/agents\/[^/]+\/history$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const limit = Number(url.searchParams.get('limit') ?? '100');
        const history = supervisor.getConversationHistory(identifier, limit);
        sendJson(response, 200, { history });
        return;
      }

      if (method === 'POST' && url.pathname.match(/^\/agents\/[^/]+\/message$/)) {
        const fromIdentifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const body = await readBody(request) as { to: string; content: string };
        if (!body.to || !body.content) {
          sendJson(response, 400, { error: 'Missing required fields: to, content' });
          return;
        }
        const result = await supervisor.sendAgentMessage(fromIdentifier, body.to, body.content);
        sendJson(response, 200, { ok: true, ...result });
        return;
      }

      if (method === 'GET' && url.pathname.match(/^\/agents\/[^/]+\/attach$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const replay = url.searchParams.get('replay') !== 'false';
        const replayLimit = Number(url.searchParams.get('replay_limit') ?? '10');

        // SSE stream
        response.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive',
        });

        // Replay recent output first
        if (replay) {
          const recent = supervisor.getRecentOutput(identifier, replayLimit);
          for (const msg of recent.reverse()) {
            sendSSE(response, 'replay', { role: msg.role, content: msg.content, timestamp: msg.createdAt });
          }
        }

        sendSSE(response, 'attached', { agentId: identifier, timestamp: new Date().toISOString() });

        // Subscribe to live events
        const detach = supervisor.attach(identifier, (event) => {
          sendSSE(response, event.type, event.data);
        });

        request.on('close', () => {
          detach();
        });
        return;
      }

      if (method === 'POST' && url.pathname.match(/^\/agents\/[^/]+\/resume$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const agent = await supervisor.resumeAgent(identifier);
        sendJson(response, 200, { agent });
        return;
      }

      if (method === 'GET' && url.pathname.match(/^\/agents\/[^/]+\/logs$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const limit = Number(url.searchParams.get('limit') ?? '20');
        sendJson(response, 200, { logs: supervisor.getLogs(identifier, limit) });
        return;
      }

      if (method === 'POST' && url.pathname.match(/^\/agents\/[^/]+\/stop$/)) {
        const identifier = decodeURIComponent(url.pathname.split('/')[2] ?? '');
        const body = await readBody(request) as { deleteSession?: boolean };
        const agent = await supervisor.stopAgent(identifier, body.deleteSession ?? false);
        sendJson(response, 200, { agent });
        return;
      }

      if (method === 'POST' && url.pathname === '/shutdown') {
        sendJson(response, 200, { ok: true });
        setTimeout(() => {
          void supervisor.shutdown().finally(() => server.close(() => process.exit(0)));
        }, 50);
        return;
      }

      sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return server;
}
