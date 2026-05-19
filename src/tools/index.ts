/**
 * Tool Registration Layer — Phase 3
 *
 * Resolves base tools from profiles and provides SDK-compatible tool definitions.
 * Phase 1 agents had empty tool arrays. Now we resolve file tools (view/glob/grep/shell)
 * for profiles that declare them in baseTools.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const FILE_TOOLS: Record<string, ToolDefinition> = {
  view: {
    name: 'view',
    description: 'Read the contents of a file at the given path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the file to read.' },
        view_range: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional [start, end] line range (1-indexed).',
        },
      },
      required: ['path'],
    },
  },
  glob: {
    name: 'glob',
    description: 'Find files matching a glob pattern.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "**/*.ts").' },
        paths: { type: 'string', description: 'Base directory to search in.' },
      },
      required: ['pattern'],
    },
  },
  grep: {
    name: 'grep',
    description: 'Search file contents for a regex pattern using ripgrep.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for.' },
        paths: { type: 'string', description: 'Directory to search in.' },
        glob: { type: 'string', description: 'File type filter glob.' },
      },
      required: ['pattern'],
    },
  },
  shell: {
    name: 'shell',
    description: 'Execute a shell command in the agent working directory.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to run.' },
        cwd: { type: 'string', description: 'Working directory (defaults to agent cwd).' },
      },
      required: ['command'],
    },
  },
};

const TOOL_PROFILES: Record<string, string[]> = {
  'file-tools': ['view', 'glob', 'grep'],
  'dev-tools': ['view', 'glob', 'grep', 'shell'],
};

/**
 * Resolve tool definitions from a list of baseTools declared in a profile.
 * Supports individual tool names and tool-profile groups.
 */
export function resolveTools(baseTools: string[]): ToolDefinition[] {
  const resolved = new Set<string>();

  for (const entry of baseTools) {
    if (TOOL_PROFILES[entry]) {
      for (const tool of TOOL_PROFILES[entry]) {
        resolved.add(tool);
      }
    } else if (FILE_TOOLS[entry]) {
      resolved.add(entry);
    }
  }

  return Array.from(resolved)
    .map((name) => FILE_TOOLS[name])
    .filter((t): t is ToolDefinition => !!t);
}

/**
 * Get all available tool names.
 */
export function listAvailableTools(): string[] {
  return Object.keys(FILE_TOOLS);
}

/**
 * Get all available tool profile names.
 */
export function listToolProfiles(): string[] {
  return Object.keys(TOOL_PROFILES);
}
