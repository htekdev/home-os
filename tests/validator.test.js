import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProfile } from '../dist/profiles/validator.js';

test('validateProfile accepts valid profile', () => {
  const result = validateProfile({
    name: 'test-agent',
    description: 'A test agent',
    systemPrompt: 'You are a test agent.',
    baseTools: ['file-tools'],
  }, 'test.yaml');

  assert.equal(result.valid, true);
  assert.ok(result.profile);
  assert.equal(result.profile.name, 'test-agent');
  assert.equal(result.errors.length, 0);
});

test('validateProfile rejects missing name', () => {
  const result = validateProfile({
    systemPrompt: 'Hello',
  }, 'bad.yaml');

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.field === 'name'));
});

test('validateProfile rejects missing systemPrompt', () => {
  const result = validateProfile({
    name: 'my-agent',
  }, 'bad.yaml');

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.field === 'systemPrompt'));
});

test('validateProfile rejects invalid name format', () => {
  const result = validateProfile({
    name: 'My Agent!',
    systemPrompt: 'Hello',
  }, 'bad.yaml');

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.field === 'name' && e.message.includes('lowercase')));
});

test('validateProfile rejects invalid baseTools entries', () => {
  const result = validateProfile({
    name: 'test-agent',
    systemPrompt: 'Hello',
    baseTools: ['file-tools', 'nonexistent-tool'],
  }, 'test.yaml');

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.field === 'baseTools' && e.message.includes('nonexistent-tool')));
});

test('validateProfile validates mcpServers structure', () => {
  const result = validateProfile({
    name: 'mcp-agent',
    systemPrompt: 'Hello',
    mcpServers: [
      { name: 'test-mcp', command: 'node', args: ['server.js'] },
    ],
  }, 'mcp.yaml');

  assert.equal(result.valid, true);
  assert.ok(result.profile);
  assert.equal(result.profile.mcpServers?.length, 1);
  assert.equal(result.profile.mcpServers?.[0].name, 'test-mcp');
});

test('validateProfile rejects mcpServers missing command', () => {
  const result = validateProfile({
    name: 'mcp-agent',
    systemPrompt: 'Hello',
    mcpServers: [
      { name: 'bad-mcp' },
    ],
  }, 'mcp.yaml');

  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.field.includes('command')));
});

test('validateProfile rejects non-object input', () => {
  const result = validateProfile(null, 'null.yaml');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.message.includes('YAML object')));
});

test('validateProfile accepts minimal valid profile (no baseTools)', () => {
  const result = validateProfile({
    name: 'minimal',
    systemPrompt: 'Hello world',
  }, 'minimal.yaml');

  assert.equal(result.valid, true);
  assert.ok(result.profile);
  assert.deepEqual(result.profile.baseTools, []);
});
