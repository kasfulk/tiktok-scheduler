// pm2 ecosystem for tiktok-scheduler. Loads .env so web + worker share one config.
const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"(.*)"$/, '$1')];
    }),
);

const PORT = '3100';
const DEMO_PORT = '3101';

// Demo instance: own DB, own storage, own Redis db, publishes simulated by the mock server.
// Nothing it does can reach TikTok or touch the production rows.
const demoEnv = {
  ...env,
  DEMO_MODE: 'true',
  TIKTOK_API_MODE: 'mock',
  PORT: DEMO_PORT,
  APP_URL: `http://192.168.1.11:${DEMO_PORT}`,
  DATABASE_URL: 'file:../data/demo.db',
  STORAGE_ROOT: './storage-demo',
  REDIS_URL: 'redis://127.0.0.1:6379/1',
};

module.exports = {
  apps: [
    {
      name: 'tiktok-scheduler-web',
      cwd: path.join(__dirname, 'apps/web'),
      script: path.join(__dirname, 'node_modules/next/dist/bin/next'),
      args: `start -H 0.0.0.0 -p ${PORT}`,
      interpreter: 'node',
      env: { ...env, PORT },
    },
    {
      name: 'tiktok-scheduler-worker',
      cwd: path.join(__dirname, 'apps/worker'),
      script: path.join(__dirname, 'node_modules/tsx/dist/cli.mjs'),
      args: 'src/main.ts',
      interpreter: 'node',
      env,
    },
    {
      name: 'tiktok-scheduler-demo-web',
      cwd: path.join(__dirname, 'apps/web'),
      script: path.join(__dirname, 'node_modules/next/dist/bin/next'),
      args: `start -H 0.0.0.0 -p ${DEMO_PORT}`,
      interpreter: 'node',
      env: demoEnv,
    },
    {
      name: 'tiktok-scheduler-demo-worker',
      cwd: path.join(__dirname, 'apps/worker'),
      script: path.join(__dirname, 'node_modules/tsx/dist/cli.mjs'),
      args: 'src/main.ts',
      interpreter: 'node',
      env: demoEnv,
    },
  ],
};
