import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { getAgentLogs, getDaemonStatus, listAgents, spawnAgent, stopAgent, stopDaemon } from '../ipc/client.js';
import { HOME_OS_ROOT } from '../utils/paths.js';

const DEFAULT_PORT = 44123;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isDaemonRunning(): Promise<boolean> {
  try {
    await getDaemonStatus();
    return true;
  } catch {
    return false;
  }
}

async function ensureDaemonStarted(): Promise<void> {
  if (await isDaemonRunning()) {
    return;
  }

  const entrypoint = join(HOME_OS_ROOT, 'dist', 'daemon', 'index.js');
  const child = spawn(process.execPath, [entrypoint, '--port', String(DEFAULT_PORT)], {
    cwd: HOME_OS_ROOT,
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (await isDaemonRunning()) {
      return;
    }
    await sleep(250);
  }

  throw new Error('Timed out waiting for home-osd to start.');
}

const program = new Command();
program.name('home-os').description('Home OS CLI for persistent Copilot SDK sessions');

program
  .command('start')
  .description('Start the Home OS daemon')
  .action(async () => {
    await ensureDaemonStarted();
    const status = await getDaemonStatus();
    console.log(`home-osd running on port ${status.port}`);
  });

program
  .command('status')
  .description('Show daemon status')
  .action(async () => {
    if (!(await isDaemonRunning())) {
      console.log('home-osd is not running');
      return;
    }
    const status = await getDaemonStatus();
    console.log(JSON.stringify(status, null, 2));
  });

program
  .command('spawn <profile>')
  .description('Spawn a persistent Home OS agent session')
  .option('--cwd <path>', 'Working directory for the agent')
  .option('--label <label>', 'Optional human-friendly label')
  .option('--model <model>', 'Optional model override')
  .action(async (profile: string, options: { cwd?: string; label?: string; model?: string }) => {
    await ensureDaemonStarted();
    const response = await spawnAgent({ profile, cwd: options.cwd, label: options.label, model: options.model });
    const agent = response.agent as { agentId: string; profile: string; sdkSessionId: string; cwd: string; status: string };
    console.log(`Spawned ${agent.profile} as ${agent.agentId}`);
    console.log(`  session: ${agent.sdkSessionId}`);
    console.log(`  cwd: ${agent.cwd}`);
    console.log(`  status: ${agent.status}`);
  });

program
  .command('list')
  .description('List tracked Home OS agents')
  .action(async () => {
    await ensureDaemonStarted();
    const response = await listAgents();
    const agents = response.agents as Array<{ agentId: string; profile: string; status: string; cwd: string }>;
    if (agents.length === 0) {
      console.log('No agents tracked yet.');
      return;
    }
    for (const agent of agents) {
      console.log(`${agent.agentId}\t${agent.profile}\t${agent.status}\t${agent.cwd}`);
    }
  });

program
  .command('logs <agent>')
  .description('Show recent event logs for an agent')
  .option('--limit <n>', 'Number of log rows to show', '20')
  .action(async (agent: string, options: { limit: string }) => {
    await ensureDaemonStarted();
    const response = await getAgentLogs(agent, Number(options.limit));
    const logs = response.logs as Array<{ createdAt: string; eventType: string; payloadJson: string | null }>;
    if (logs.length === 0) {
      console.log('No logs found.');
      return;
    }
    for (const log of logs) {
      console.log(`[${log.createdAt}] ${log.eventType} ${log.payloadJson ?? ''}`.trim());
    }
  });

program
  .command('stop <agent>')
  .description('Stop a persistent agent session')
  .option('--delete-session', 'Delete the underlying SDK session too', false)
  .action(async (agent: string, options: { deleteSession?: boolean }) => {
    await ensureDaemonStarted();
    const response = await stopAgent(agent, options.deleteSession ?? false);
    const payload = response as { agent: { agentId: string; status: string } };
    console.log(`Stopped ${payload.agent.agentId} (${payload.agent.status})`);
  });

program
  .command('stop-daemon')
  .description('Stop the Home OS daemon')
  .action(async () => {
    if (!(await isDaemonRunning())) {
      console.log('home-osd is not running');
      return;
    }
    await stopDaemon();
    console.log('home-osd stopped');
  });

if (!existsSync(join(HOME_OS_ROOT, 'dist', 'daemon', 'index.js')) && !process.argv.includes('build')) {
  console.error('Home OS is not built yet. Run `npm run build` first.');
  process.exit(1);
}

await program.parseAsync(process.argv);
