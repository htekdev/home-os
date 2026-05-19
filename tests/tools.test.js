import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTools, listAvailableTools, listToolProfiles } from '../dist/tools/index.js';

test('resolveTools resolves individual tool names', () => {
  const tools = resolveTools(['view', 'grep']);
  const names = tools.map(t => t.name);
  assert.deepEqual(names.sort(), ['grep', 'view']);
});

test('resolveTools resolves tool profile groups', () => {
  const tools = resolveTools(['file-tools']);
  const names = tools.map(t => t.name);
  assert.deepEqual(names.sort(), ['glob', 'grep', 'view']);
});

test('resolveTools resolves dev-tools group including shell', () => {
  const tools = resolveTools(['dev-tools']);
  const names = tools.map(t => t.name);
  assert.deepEqual(names.sort(), ['glob', 'grep', 'shell', 'view']);
});

test('resolveTools deduplicates when mixing profiles and individual tools', () => {
  const tools = resolveTools(['file-tools', 'view', 'shell']);
  const names = tools.map(t => t.name);
  assert.deepEqual(names.sort(), ['glob', 'grep', 'shell', 'view']);
});

test('resolveTools returns empty array for unknown entries', () => {
  const tools = resolveTools(['nonexistent-tool', 'fake-profile']);
  assert.equal(tools.length, 0);
});

test('resolveTools returns empty for empty input', () => {
  const tools = resolveTools([]);
  assert.equal(tools.length, 0);
});

test('each resolved tool has name, description, and parameters', () => {
  const tools = resolveTools(['dev-tools']);
  for (const tool of tools) {
    assert.ok(tool.name, 'Tool should have a name');
    assert.ok(tool.description, 'Tool should have a description');
    assert.ok(tool.parameters, 'Tool should have parameters');
    assert.equal(tool.parameters.type, 'object');
  }
});

test('listAvailableTools returns all tool names', () => {
  const tools = listAvailableTools();
  assert.deepEqual(tools.sort(), ['glob', 'grep', 'shell', 'view']);
});

test('listToolProfiles returns profile names', () => {
  const profiles = listToolProfiles();
  assert.ok(profiles.includes('file-tools'));
  assert.ok(profiles.includes('dev-tools'));
});
