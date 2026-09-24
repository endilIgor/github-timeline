// Teste da Tarefa 7: rota HTTP GET /api/timeline/:username, erros JSON e CORS (CA-1 a CA-11),
// reunindo as funções das Tarefas 2-6 via fetch injetável, sem chamadas reais ao GitHub.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import type { Timeline } from '../src/timeline.js';

interface ErrorBody {
  error: { code: string; message: string };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

function profileResponse(login: string, type: 'User' | 'Organization' = 'User'): Response {
  return jsonResponse({ login, type });
}

function reposResponse(repos: unknown[], linkHeader?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (linkHeader) {
    headers.link = linkHeader;
  }
  return new Response(JSON.stringify(repos), { status: 200, headers });
}

function makeRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'repo',
    description: null,
    created_at: '2020-01-01T00:00:00Z',
    html_url: 'https://github.com/octocat/repo',
    fork: false,
    private: false,
    ...overrides,
  };
}

// CA-1, CA-2, CA-3, CA-4, CA-6: sucesso reunindo páginas, filtrando privados, ordenando e resumindo por ano.

test('GET /api/timeline/:username retorna 200 com campos exatos, reúne páginas, filtra privados, ordena e resume por ano (CA-1, CA-2, CA-3, CA-4, CA-6)', async () => {
  const nextUrl = 'https://api.github.com/users/octocat/repos?per_page=100&type=all&page=2';
  const fetchStub: typeof fetch = async (input) => {
    const url = String(input);
    if (url === 'https://api.github.com/users/octocat') {
      return profileResponse('octocat', 'User');
    }
    if (url === nextUrl) {
      return reposResponse([
        makeRepo({
          id: 4,
          name: 'beta',
          created_at: '2020-06-01T00:00:00Z',
          description: 'B project',
          html_url: 'https://github.com/octocat/beta',
        }),
      ]);
    }
    return reposResponse(
      [
        makeRepo({
          id: 1,
          name: 'zeta',
          created_at: '2021-05-01T00:00:00Z',
          description: 'Z project',
          html_url: 'https://github.com/octocat/zeta',
        }),
        makeRepo({
          id: 2,
          name: 'alpha',
          created_at: '2021-05-01T00:00:00Z',
          description: null,
          fork: true,
          html_url: 'https://github.com/octocat/alpha',
        }),
        makeRepo({
          id: 3,
          name: 'secret',
          created_at: '2019-01-01T00:00:00Z',
          description: 'private',
          private: true,
          html_url: 'https://github.com/octocat/secret',
        }),
      ],
      `<${nextUrl}>; rel="next"`,
    );
  };

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 200);
  const body = await readJson<Timeline>(response);

  assert.deepEqual(Object.keys(body).sort(), ['repositories', 'summaryByYear', 'total', 'username']);
  assert.equal(body.username, 'octocat');
  assert.equal(body.total, 3);
  assert.deepEqual(
    body.repositories.map((repo: { name: string }) => repo.name),
    ['beta', 'alpha', 'zeta'],
  );
  assert.deepEqual(Object.keys(body.repositories[0]).sort(), ['createdAt', 'description', 'isFork', 'name', 'url']);
  assert.equal(body.repositories[1].description, null);
  assert.equal(body.repositories[1].isFork, true);
  assert.deepEqual(body.summaryByYear, [
    { year: 2020, count: 1 },
    { year: 2021, count: 2 },
  ]);
  assert.equal(
    body.summaryByYear.reduce((sum: number, entry: { count: number }) => sum + entry.count, 0),
    body.total,
  );
});

// CA-5: conta pessoal válida sem repositórios.

test('conta pessoal válida sem repositórios públicos retorna 200 com listas vazias (CA-5)', async () => {
  const fetchStub: typeof fetch = async (input) => {
    const url = String(input);
    if (url === 'https://api.github.com/users/octocat') {
      return profileResponse('octocat', 'User');
    }
    return reposResponse([]);
  };

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 200);
  const body = await readJson<Timeline>(response);
  assert.equal(body.total, 0);
  assert.deepEqual(body.repositories, []);
  assert.deepEqual(body.summaryByYear, []);
});

// CA-7: nomes malformados retornam 400 sem consultar o GitHub.

test('login com @ retorna 400 INVALID_USERNAME sem consultar o GitHub (CA-7)', async () => {
  let fetchCalls = 0;
  const fetchStub: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch não deveria ser chamado para nome inválido');
  };

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/%40');

  assert.equal(response.status, 400);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'INVALID_USERNAME');
  assert.equal(typeof body.error.message, 'string');
  assert.equal(fetchCalls, 0);
});

test('login com espaço retorna 400 INVALID_USERNAME sem consultar o GitHub (CA-7)', async () => {
  let fetchCalls = 0;
  const fetchStub: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch não deveria ser chamado para nome inválido');
  };

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octo%20cat');

  assert.equal(response.status, 400);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'INVALID_USERNAME');
  assert.equal(fetchCalls, 0);
});

test('login com mais de 39 caracteres retorna 400 INVALID_USERNAME sem consultar o GitHub (CA-7)', async () => {
  let fetchCalls = 0;
  const fetchStub: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error('fetch não deveria ser chamado para nome inválido');
  };
  const tooLong = 'a'.repeat(40);

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request(`/api/timeline/${tooLong}`);

  assert.equal(response.status, 400);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'INVALID_USERNAME');
  assert.equal(fetchCalls, 0);
});

// CA-8: conta inexistente e conta de organização.

test('conta inexistente retorna 404 USER_NOT_FOUND (CA-8)', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ message: 'Not Found' }, { status: 404 });

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/conta-inexistente');

  assert.equal(response.status, 404);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'USER_NOT_FOUND');
});

test('conta de organização retorna 422 ORGANIZATION_NOT_SUPPORTED (CA-8)', async () => {
  const fetchStub: typeof fetch = async () => profileResponse('github', 'Organization');

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/github');

  assert.equal(response.status, 422);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'ORGANIZATION_NOT_SUPPORTED');
});

// CA-9: limite de requisições e demais falhas do GitHub/rede.

test('429 do GitHub ao buscar perfil retorna 429 GITHUB_RATE_LIMITED (CA-9)', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ message: 'API rate limit exceeded' }, { status: 429 });

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 429);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'GITHUB_RATE_LIMITED');
});

test('403 identificável como limite ao buscar perfil retorna 429 GITHUB_RATE_LIMITED (CA-9)', async () => {
  const fetchStub: typeof fetch = async () =>
    jsonResponse({ message: 'API rate limit exceeded' }, { status: 403, headers: { 'x-ratelimit-remaining': '0' } });

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 429);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'GITHUB_RATE_LIMITED');
});

test('erro de rede ao buscar perfil retorna 502 GITHUB_UNAVAILABLE (CA-9)', async () => {
  const fetchStub: typeof fetch = async () => {
    throw new TypeError('fetch failed');
  };

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 502);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'GITHUB_UNAVAILABLE');
});

test('5xx do GitHub ao buscar perfil retorna 502 GITHUB_UNAVAILABLE (CA-9)', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ message: 'Internal Server Error' }, { status: 500 });

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 502);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'GITHUB_UNAVAILABLE');
});

test('payload de perfil inválido retorna 502 GITHUB_UNAVAILABLE (CA-9)', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({}, { status: 200 });

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 502);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'GITHUB_UNAVAILABLE');
});

test('falha na página seguinte de repositórios retorna 502 GITHUB_UNAVAILABLE sem resposta parcial (CA-9)', async () => {
  const nextUrl = 'https://api.github.com/users/octocat/repos?per_page=100&type=all&page=2';
  const fetchStub: typeof fetch = async (input) => {
    const url = String(input);
    if (url === 'https://api.github.com/users/octocat') {
      return profileResponse('octocat', 'User');
    }
    if (url === nextUrl) {
      return jsonResponse({ message: 'Internal Server Error' }, { status: 500 });
    }
    return reposResponse([makeRepo({ id: 1, name: 'repo-a' })], `<${nextUrl}>; rel="next"`);
  };

  const app = createApp({ fetchImpl: fetchStub });
  const response = await app.request('/api/timeline/octocat');

  assert.equal(response.status, 502);
  const body = await readJson<ErrorBody>(response);
  assert.equal(body.error.code, 'GITHUB_UNAVAILABLE');
  assert.equal('repositories' in body, false);
  assert.equal('total' in body, false);
  assert.equal('summaryByYear' in body, false);
});

// CA-11: duas chamadas seguidas disparam novas consultas (sem cache).

test('duas chamadas seguidas para o mesmo usuário disparam novas consultas ao GitHub, sem cache (CA-11)', async () => {
  let callCount = 0;
  const fetchStub: typeof fetch = async (input) => {
    callCount += 1;
    const url = String(input);
    if (url === 'https://api.github.com/users/octocat') {
      return profileResponse('octocat', 'User');
    }
    return reposResponse([makeRepo({ id: 1, name: 'repo-a' })]);
  };

  const app = createApp({ fetchImpl: fetchStub });

  const first = await app.request('/api/timeline/octocat');
  assert.equal(first.status, 200);
  const callsAfterFirst = callCount;
  assert.equal(callsAfterFirst, 2);

  const second = await app.request('/api/timeline/octocat');
  assert.equal(second.status, 200);

  assert.equal(callCount, callsAfterFirst * 2);
});

// CA-10: CORS restrito às origens de CORS_ORIGINS.

test('CORS permite a origem configurada em CORS_ORIGINS (CA-10)', async () => {
  const fetchStub: typeof fetch = async (input) => {
    const url = String(input);
    if (url === 'https://api.github.com/users/octocat') {
      return profileResponse('octocat', 'User');
    }
    return reposResponse([]);
  };

  const app = createApp({ fetchImpl: fetchStub, corsOrigins: ['http://localhost:5173'] });
  const response = await app.request('/api/timeline/octocat', {
    headers: { origin: 'http://localhost:5173' },
  });

  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('CORS nega a origem quando CORS_ORIGINS não está configurada (CA-10)', async () => {
  const fetchStub: typeof fetch = async (input) => {
    const url = String(input);
    if (url === 'https://api.github.com/users/octocat') {
      return profileResponse('octocat', 'User');
    }
    return reposResponse([]);
  };

  const app = createApp({ fetchImpl: fetchStub, corsOrigins: [] });
  const response = await app.request('/api/timeline/octocat', {
    headers: { origin: 'http://localhost:5173' },
  });

  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('CORS nega uma origem diferente das listadas em CORS_ORIGINS (CA-10)', async () => {
  const fetchStub: typeof fetch = async (input) => {
    const url = String(input);
    if (url === 'https://api.github.com/users/octocat') {
      return profileResponse('octocat', 'User');
    }
    return reposResponse([]);
  };

  const app = createApp({ fetchImpl: fetchStub, corsOrigins: ['http://localhost:5173'] });
  const response = await app.request('/api/timeline/octocat', {
    headers: { origin: 'http://evil.example.com' },
  });

  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('preflight CORS para origem permitida responde sem cabeçalho wildcard (CA-10)', async () => {
  const fetchStub: typeof fetch = async () => {
    throw new Error('fetch não deveria ser chamado durante preflight');
  };

  const app = createApp({ fetchImpl: fetchStub, corsOrigins: ['http://localhost:5173'] });
  const response = await app.request('/api/timeline/octocat', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'GET',
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

// CA-10 (reforço): CORS lido de process.env.CORS_ORIGINS (CSV) quando createApp não recebe corsOrigins.

test('CORS via process.env.CORS_ORIGINS (CSV) permite as origens listadas e nega outra (CA-10)', async () => {
  const previousCorsOrigins = process.env.CORS_ORIGINS;
  process.env.CORS_ORIGINS = 'http://a.dev, http://b.dev';
  try {
    const fetchStub: typeof fetch = async (input) => {
      const url = String(input);
      if (url === 'https://api.github.com/users/octocat') {
        return profileResponse('octocat', 'User');
      }
      return reposResponse([]);
    };

    const app = createApp({ fetchImpl: fetchStub });

    const responseA = await app.request('/api/timeline/octocat', {
      headers: { origin: 'http://a.dev' },
    });
    assert.equal(responseA.headers.get('access-control-allow-origin'), 'http://a.dev');

    const responseB = await app.request('/api/timeline/octocat', {
      headers: { origin: 'http://b.dev' },
    });
    assert.equal(responseB.headers.get('access-control-allow-origin'), 'http://b.dev');

    const responseStranger = await app.request('/api/timeline/octocat', {
      headers: { origin: 'http://estranha.dev' },
    });
    assert.equal(responseStranger.headers.get('access-control-allow-origin'), null);
  } finally {
    if (previousCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = previousCorsOrigins;
    }
  }
});

test('CORS nega toda origem quando process.env.CORS_ORIGINS está ausente (CA-10)', async () => {
  const previousCorsOrigins = process.env.CORS_ORIGINS;
  delete process.env.CORS_ORIGINS;
  try {
    const fetchStub: typeof fetch = async (input) => {
      const url = String(input);
      if (url === 'https://api.github.com/users/octocat') {
        return profileResponse('octocat', 'User');
      }
      return reposResponse([]);
    };

    const app = createApp({ fetchImpl: fetchStub });
    const response = await app.request('/api/timeline/octocat', {
      headers: { origin: 'http://a.dev' },
    });
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    if (previousCorsOrigins === undefined) {
      delete process.env.CORS_ORIGINS;
    } else {
      process.env.CORS_ORIGINS = previousCorsOrigins;
    }
  }
});
