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

export function createIpcServer(supervisor: AgentSupervisor, port: number) {
  const server = createServer(async (request, response) => {
    try {
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

      if (method === 'GET' && url.pathname === '/health') {
        sendJson(response, 200, supervisor.getStatus());
        return;
      }

      if (method === 'GET' && url.pathname === '/agents') {
        sendJson(response, 200, { agents: supervisor.listAgents() });
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
        const body = await readBody(request) as { prompt: string };
        await supervisor.sendToAgent(identifier, body.prompt);
        sendJson(response, 200, { ok: true });
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
