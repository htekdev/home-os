/**
 * Profile Validator — Phase 4
 *
 * Validates YAML profiles against the AgentProfile schema and reports clear errors.
 */

import type { AgentProfile, McpServerConfig, ProfileValidationError, ProfileValidationResult } from '../types.js';

const REQUIRED_FIELDS = ['name', 'systemPrompt'] as const;
const VALID_TOOL_ENTRIES = ['view', 'glob', 'grep', 'shell', 'file-tools', 'dev-tools'];

export function validateProfile(parsed: unknown, fileName: string): ProfileValidationResult {
  const errors: ProfileValidationError[] = [];

  if (!parsed || typeof parsed !== 'object') {
    errors.push({ file: fileName, field: '(root)', message: 'Profile must be a YAML object' });
    return { valid: false, profile: null, errors };
  }

  const obj = parsed as Record<string, unknown>;

  // Required fields
  for (const field of REQUIRED_FIELDS) {
    if (!obj[field] || typeof obj[field] !== 'string' || (obj[field] as string).trim().length === 0) {
      errors.push({ file: fileName, field, message: `Required field '${field}' is missing or empty` });
    }
  }

  // Name format
  if (obj.name && typeof obj.name === 'string') {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(obj.name)) {
      errors.push({ file: fileName, field: 'name', message: 'Name must be lowercase alphanumeric with dashes (e.g. my-agent)' });
    }
  }

  // Description (optional but must be string if provided)
  if (obj.description !== undefined && typeof obj.description !== 'string') {
    errors.push({ file: fileName, field: 'description', message: 'Description must be a string' });
  }

  // baseTools validation
  if (obj.baseTools !== undefined) {
    if (!Array.isArray(obj.baseTools)) {
      errors.push({ file: fileName, field: 'baseTools', message: 'baseTools must be an array of strings' });
    } else {
      for (const tool of obj.baseTools) {
        if (typeof tool !== 'string') {
          errors.push({ file: fileName, field: 'baseTools', message: `Each baseTools entry must be a string, got: ${typeof tool}` });
        } else if (!VALID_TOOL_ENTRIES.includes(tool)) {
          errors.push({ file: fileName, field: 'baseTools', message: `Unknown tool entry '${tool}'. Valid: ${VALID_TOOL_ENTRIES.join(', ')}` });
        }
      }
    }
  }

  // mcpServers validation
  if (obj.mcpServers !== undefined) {
    if (!Array.isArray(obj.mcpServers)) {
      errors.push({ file: fileName, field: 'mcpServers', message: 'mcpServers must be an array' });
    } else {
      for (let i = 0; i < obj.mcpServers.length; i++) {
        const server = obj.mcpServers[i] as Record<string, unknown>;
        if (!server || typeof server !== 'object') {
          errors.push({ file: fileName, field: `mcpServers[${i}]`, message: 'Each MCP server must be an object' });
          continue;
        }
        if (!server.name || typeof server.name !== 'string') {
          errors.push({ file: fileName, field: `mcpServers[${i}].name`, message: 'MCP server must have a name (string)' });
        }
        if (!server.command || typeof server.command !== 'string') {
          errors.push({ file: fileName, field: `mcpServers[${i}].command`, message: 'MCP server must have a command (string)' });
        }
        if (server.args !== undefined && !Array.isArray(server.args)) {
          errors.push({ file: fileName, field: `mcpServers[${i}].args`, message: 'MCP server args must be an array' });
        }
        if (server.env !== undefined && (typeof server.env !== 'object' || server.env === null)) {
          errors.push({ file: fileName, field: `mcpServers[${i}].env`, message: 'MCP server env must be an object' });
        }
      }
    }
  }

  // defaultModel (optional string)
  if (obj.defaultModel !== undefined && typeof obj.defaultModel !== 'string') {
    errors.push({ file: fileName, field: 'defaultModel', message: 'defaultModel must be a string' });
  }

  // bootstrapPrompt (optional string)
  if (obj.bootstrapPrompt !== undefined && typeof obj.bootstrapPrompt !== 'string') {
    errors.push({ file: fileName, field: 'bootstrapPrompt', message: 'bootstrapPrompt must be a string' });
  }

  if (errors.length > 0) {
    return { valid: false, profile: null, errors };
  }

  // Build valid profile
  const profile: AgentProfile = {
    name: obj.name as string,
    description: (obj.description as string) ?? `Profile loaded from ${fileName}`,
    systemPrompt: obj.systemPrompt as string,
    defaultModel: obj.defaultModel as string | undefined,
    cwd: obj.cwd as string | undefined,
    bootstrapPrompt: obj.bootstrapPrompt as string | undefined,
    baseTools: (obj.baseTools as string[]) ?? [],
    customTools: obj.customTools as string[] | undefined,
    mcpProfile: obj.mcpProfile as string | undefined,
    mcpServers: obj.mcpServers as McpServerConfig[] | undefined,
  };

  return { valid: true, profile, errors: [] };
}
