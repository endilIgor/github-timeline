// Servidor local Node (Tarefa 8): inicia o app Hono via @hono/node-server na porta
// configurável (PORT, padrão 3000). Não inicia automaticamente ao ser importado pelos
// testes; a entrada CLI só roda quando este arquivo é executado diretamente.
import { serve } from '@hono/node-server';
import type { ServerType } from '@hono/node-server';
import { pathToFileURL } from 'node:url';
import { createApp, type CreateAppOptions } from './app.js';

export interface StartServerOptions extends CreateAppOptions {
  port?: number;
}

export interface RunningServer {
  server: ServerType;
  port: number;
  close: () => Promise<void>;
}

const DEFAULT_PORT = 3000;

export function resolvePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_PORT;
  }
  return parsed;
}

export function startServer(options: StartServerOptions = {}): Promise<RunningServer> {
  const { port, ...appOptions } = options;
  const app = createApp(appOptions);
  const resolvedPort = port ?? resolvePort(process.env.PORT);

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: resolvedPort }, (info) => {
      resolve({
        server,
        port: info.port,
        close: () =>
          new Promise((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  startServer().then((running) => {
    console.log(`Servidor rodando em http://127.0.0.1:${running.port}`);
  });
}
