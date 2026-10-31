/** Minimal structured logger: one JSON line per event, secrets redacted. */

type Level = 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /token|secret|password|authorization|cookie/i;

function sanitize(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) output[key] = '[redacted]';
    else if (value instanceof Error) output[key] = { name: value.name, message: value.message };
    else output[key] = value;
  }
  return output;
}

export function log(level: Level, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...sanitize(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}