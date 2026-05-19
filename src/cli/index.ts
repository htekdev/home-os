import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Command } from 'commander';
import { getAgentLogs, getAttachUrl, getDaemonStatus, inspectAgent, listAgents, resumeAgent, sendToAgent, spawnAgent, stopAgent, stopDaemon } from '../ipc/client.js';
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
    const agents = response.agents as Array<{ agentId: string; profile: string; status: string; cwd: string; lastActiveAt: string }>;
    if (agents.length === 0) {
      console.log('No agents tracked yet.');
      return;
    }
    console.log('ID\t\t\tPROFILE\t\t\tSTATUS\t\tLAST ACTIVE');
    for (const agent of agents) {
      const lastActive = formatRelative(agent.lastActiveAt);
      console.log(`${agent.agentId}\t${agent.profile}\t\t${agent.status}\t\t${lastActive}`);
    }
  });

program
  .command('send <agent> <prompt>')
  .description('Send a prompt to a persistent agent session')
  .action(async (agent: string, prompt: string) => {
    await ensureDaemonStarted();
    const result = await sendToAgent(agent, prompt);
    console.log(`Message sent to ${result.agentId}`);
    if (result.response) {
      console.log(`\nResponse:\n${result.response}`);
    }
  });

program
  .command('attach <agent>')
  .description('Stream live events from a persistent agent session')
  .option('--no-replay', 'Skip replaying recent output')
  .option('--replay-limit <n>', 'Number of recent messages to replay', '10')
  .action(async (agent: string, options: { replay?: boolean; replayLimit?: string }) => {
    await ensureDaemonStarted();
    const replay = options.replay !== false;
    const replayLimit = Number(options.replayLimit ?? '10');
    const url = getAttachUrl(agent, replay, replayLimit);

    console.log(`Attaching to ${agent}... (Ctrl+C to detach)`);
    console.log('---');

    const response = await fetch(url);
    if (!response.ok) {
      const payload = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
      throw new Error(String(payload.error ?? response.statusText));
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response stream available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    const handleLine = (line: string) => {
      if (line.startsWith('event: ')) {
        // event type line — skip for display
      } else if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.content) {
            console.log(`[assistant] ${data.content}`);
          } else if (data.role && data.content) {
            console.log(`[${data.role}] ${data.content}`);
          } else if (data.agentId) {
            console.log(`[system] attached to ${data.agentId}`);
          }
        } catch {
          console.log(line.slice(6));
        }
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (line.trim()) handleLine(line);
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        throw err;
      }
    }
  });

program
  .command('inspect <agent>')
  .description('Show detailed metadata for an agent')
  .action(async (agent: string) => {
    await ensureDaemonStarted();
    const response = await inspectAgent(agent);
    const info = response.agent;
    console.log(`Agent: ${info.agentId}`);
    console.log(`  Profile:       ${info.profile}`);
    console.log(`  Label:         ${info.label ?? '(none)'}`);
    console.log(`  Status:        ${info.status}`);
    console.log(`  Loaded:        ${info.isLoaded ? 'yes' : 'no'}`);
    console.log(`  SDK Session:   ${info.sdkSessionId}`);
    console.log(`  CWD:           ${info.cwd}`);
    console.log(`  Model:         ${info.model ?? '(default)'}`);
    console.log(`  Tool Profile:  ${info.toolProfile ?? '(none)'}`);
    console.log(`  MCP Profile:   ${info.mcpProfile ?? '(none)'}`);
    console.log(`  Messages:      ${info.messageCount}`);
    console.log(`  Created:       ${info.createdAt}`);
    console.log(`  Last Active:   ${info.lastActiveAt}`);
    console.log(`  Stopped:       ${info.stoppedAt ?? '(running)'}`);
    console.log(`  Last Error:    ${info.lastError ?? '(none)'}`);
    if (info.metadataJson) {
      try {
        const meta = JSON.parse(info.metadataJson);
        console.log(`  Metadata:      ${JSON.stringify(meta)}`);
      } catch {
        console.log(`  Metadata:      ${info.metadataJson}`);
      }
    }
  });

program
  .command('resume <agent>')
  .description('Resume an orphaned or previously persisted agent')
  .action(async (agent: string) => {
    await ensureDaemonStarted();
    const response = await resumeAgent(agent);
    const record = response.agent;
    console.log(`Resumed ${record.agentId} (${record.profile})`);
    console.log(`  status: ${record.status}`);
    console.log(`  session: ${record.sdkSessionId}`);
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

function formatRelative(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

if (!existsSync(join(HOME_OS_ROOT, 'dist', 'daemon', 'index.js')) && !process.argv.includes('build')) {
  console.error('Home OS is not built yet. Run `npm run build` first.');
  process.exit(1);
}

await program.parseAsync(process.argv);
