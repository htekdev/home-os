import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const HOME_OS_ROOT = resolve(THIS_DIR, '..', '..');
export const RUNTIME_DIR = join(HOME_OS_ROOT, 'data', 'runtime');
export const DB_PATH = join(RUNTIME_DIR, 'home-os.db');
export const PID_PATH = join(RUNTIME_DIR, 'home-osd.pid');
export const LOG_PATH = join(RUNTIME_DIR, 'home-osd.log');

export function ensureRuntimeDir(): string {
  mkdirSync(RUNTIME_DIR, { recursive: true });
  return RUNTIME_DIR;
}
