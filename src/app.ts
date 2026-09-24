// Rota HTTP (Tarefa 7): GET /api/timeline/:username, erros JSON e CORS restrito a CORS_ORIGINS
// (CA-1, CA-2, CA-3, CA-4, CA-5, CA-6, CA-7, CA-8, CA-9, CA-10, CA-11), reunindo as Tarefas 2-6.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { isValidUsername } from './username.js';
import { fetchGithubUser, fetchGithubRepos, GithubClientError } from './github.js';
import { buildTimeline } from './timeline.js';

export interface CreateAppOptions {
  fetchImpl?: typeof fetch;
  corsOrigins?: string[];
}

function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function createApp(options: CreateAppOptions = {}): Hono {
  const fetchImpl = options.fetchImpl ?? fetch;
  const allowedOrigins = options.corsOrigins ?? parseCorsOrigins(process.env.CORS_ORIGINS);

  const app = new Hono();

  app.use('/api/*', cors({ origin: allowedOrigins }));

  app.get('/api/timeline/:username', async (c) => {
    const username = c.req.param('username');

    if (!isValidUsername(username)) {
      return c.json({ error: { code: 'INVALID_USERNAME', message: 'Nome de usuário inválido.' } }, 400);
    }

    try {
      await fetchGithubUser(username, fetchImpl);
      const repos = await fetchGithubRepos(username, fetchImpl);
      return c.json(buildTimeline(username, repos), 200);
    } catch (error) {
      if (error instanceof GithubClientError) {
        const body = { error: { code: error.code, message: error.message } };
        switch (error.code) {
          case 'USER_NOT_FOUND':
            return c.json(body, 404);
          case 'ORGANIZATION_NOT_SUPPORTED':
            return c.json(body, 422);
          case 'GITHUB_RATE_LIMITED':
            return c.json(body, 429);
          case 'GITHUB_UNAVAILABLE':
            return c.json(body, 502);
        }
      }
      throw error;
    }
  });

  return app;
}
