import { spawn } from 'node:child_process';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Local single-worker launcher. Secrets are written only to ignored .env files.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function env(path) {
  return Object.fromEntries(
    (existsSync(path) ? readFileSync(path, 'utf8') : '')
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_][A-Z0-9_]*=/.test(line))
      .map((line) => {
        const at = line.indexOf('=');
        return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')];
      }),
  );
}
const workerDir = resolve(root, 'services/worker');
const webDir = resolve(root, 'apps/web');
const workerFile = resolve(workerDir, '.env');
const webFile = resolve(webDir, '.env.local');
const settings = env(workerFile);
const token = settings.TATTOO_WORKER_TOKEN || randomBytes(32).toString('hex');
const key = settings.TATTOO_MEDIA_KEY || randomBytes(32).toString('hex');
const additions = {
  TATTOO_ENVIRONMENT: 'local',
  TATTOO_WORKER_TOKEN: token,
  TATTOO_MEDIA_KEY: key,
};
for (const [name, value] of Object.entries(additions)) {
  if (!settings[name]) appendFileSync(workerFile, `\n${name}=${value}\n`);
}
if (env(webFile).TATTOO_WORKER_TOKEN !== token)
  appendFileSync(webFile, `\nTATTOO_WORKER_TOKEN=${token}\n`);
const python = resolve(
  workerDir,
  process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python',
);
if (!existsSync(python))
  throw new Error('Instala el worker con uv sync --project services/worker.');
if (!settings.OPENAI_API_KEY && !process.env.OPENAI_API_KEY) {
  throw new Error('Configura OPENAI_API_KEY en services/worker/.env antes de iniciar.');
}
mkdirSync(resolve(workerDir, '.artifacts'), { recursive: true });
const workerPort = process.env.STUDIO_WORKER_PORT || '8000';
const webPort = process.env.STUDIO_WEB_PORT || '3000';
const common = { ...process.env, TATTOO_WORKER_TOKEN: token, TATTOO_MEDIA_KEY: key };
const children = [
  spawn(
    python,
    [
      '-m',
      'uvicorn',
      'app.main:create_app',
      '--factory',
      '--host',
      '127.0.0.1',
      '--port',
      workerPort,
    ],
    { cwd: workerDir, env: common, stdio: 'inherit', windowsHide: true },
  ),
  spawn(
    process.execPath,
    [
      resolve(webDir, 'node_modules/next/dist/bin/next'),
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      webPort,
    ],
    {
      cwd: webDir,
      env: { ...common, TATTOO_WORKER_URL: `http://127.0.0.1:${workerPort}` },
      stdio: 'inherit',
      windowsHide: true,
    },
  ),
];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
}
for (const child of children) {
  child.on('error', stop);
  child.on('exit', (code) => {
    stop();
    process.exitCode = code || 0;
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
