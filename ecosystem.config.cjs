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
  ],
};
