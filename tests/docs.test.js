import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const markdownFiles = [
  resolve(ROOT, 'README.md'),
  ...readdirSync(resolve(ROOT, 'docs'))
    .filter((name) => name.endsWith('.md'))
    .map((name) => resolve(ROOT, 'docs', name)),
];

function extractRelativeMarkdownLinks(content) {
  const matches = content.matchAll(/\[[^\]]+\]\(([^)]+)\)/g);
  return [...matches]
    .map((match) => match[1])
    .map((target) => target.split('#')[0])
    .filter((target) => target.length > 0)
    .filter((target) => !target.startsWith('http://'))
    .filter((target) => !target.startsWith('https://'))
    .filter((target) => !target.startsWith('mailto:'));
}

function extractScriptPaths(content) {
  const matches = content.matchAll(/node\s+(scripts\/[A-Za-z0-9._/-]+)/g);
  return [...matches].map((match) => match[1]);
}

test('markdown files only reference checked-in relative docs and paths', () => {
  for (const file of markdownFiles) {
    const content = readFileSync(file, 'utf8');
    for (const target of extractRelativeMarkdownLinks(content)) {
      const resolved = resolve(dirname(file), target);
      assert.ok(existsSync(resolved), `${file} references missing path: ${target}`);
    }
  }
});

test('documentation only references checked-in local scripts', () => {
  for (const file of markdownFiles) {
    const content = readFileSync(file, 'utf8');
    for (const scriptPath of extractScriptPaths(content)) {
      const resolved = resolve(ROOT, scriptPath);
      assert.ok(existsSync(resolved), `${file} references missing script: ${scriptPath}`);
    }
  }
});
