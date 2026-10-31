import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Workspace root: the directory owning `prisma/schema.prisma`. Relative env paths (STORAGE_ROOT,
 * DATABASE_URL) are resolved against it, so the web app and the worker agree on the same files even
 * though `npm -w` runs each one from a different working directory.
 */
export function repositoryRoot(start: string = process.cwd()): string {
  let current = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(path.join(current, 'prisma', 'schema.prisma'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

/** Resolve an env path: absolute stays absolute, relative becomes repository-relative. */
export function resolveFromRepository(value: string, start?: string): string {
  return path.isAbsolute(value) ? value : path.resolve(repositoryRoot(start), value);
}