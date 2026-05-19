import { writeFileSync } from 'node:fs';
import { AgentSupervisor } from './supervisor.js';
import { createIpcServer } from '../ipc/server.js';
import { PID_PATH, ensureRuntimeDir } from '../utils/paths.js';

const portArgIndex = process.argv.findIndex((arg) => arg === '--port');
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 44123;

async function main(): Promise<void> {
  ensureRuntimeDir();
  const supervisor = new AgentSupervisor({ port, enableHotReload: true });
  await supervisor.start();
  const server = createIpcServer(supervisor, port);

  server.listen(port, '127.0.0.1', () => {
    writeFileSync(PID_PATH, String(process.pid), 'utf8');
    console.log(`home-osd listening on 127.0.0.1:${port}`);
  });

  const shutdown = async () => {
    server.close();
    await supervisor.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
