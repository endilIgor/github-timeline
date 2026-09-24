// Teste das Tarefas 3 e 4: busca de perfil e paginação de repositórios GitHub via fetch injetável (CA-8, CA-9, CA-2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGithubUser, fetchGithubRepos, GithubClientError } from '../src/github.js';

function jsonResponse(body: unknown, init: { status: number; headers?: Record<string, string> } = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

function rawResponse(rawBody: string, init: { status: number; headers?: Record<string, string> } = { status: 200 }): Response {
  return new Response(rawBody, {
    status: init.status,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

test('retorna perfil para conta pessoal (User)', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ login: 'octocat', type: 'User' }, { status: 200 });

  const profile = await fetchGithubUser('octocat', fetchStub);

  assert.deepEqual(profile, { login: 'octocat', type: 'User' });
});

test('rejeita conta de organização com ORGANIZATION_NOT_SUPPORTED', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ login: 'github', type: 'Organization' }, { status: 200 });

  await assert.rejects(
    () => fetchGithubUser('github', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'ORGANIZATION_NOT_SUPPORTED',
  );
});

test('rejeita conta inexistente (404) com USER_NOT_FOUND', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ message: 'Not Found' }, { status: 404 });

  await assert.rejects(
    () => fetchGithubUser('conta-inexistente', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'USER_NOT_FOUND',
  );
});

test('rejeita 429 do GitHub com GITHUB_RATE_LIMITED', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ message: 'API rate limit exceeded' }, { status: 429 });

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_RATE_LIMITED',
  );
});

test('rejeita 403 identificável como limite de requisições com GITHUB_RATE_LIMITED', async () => {
  const fetchStub: typeof fetch = async () =>
    jsonResponse(
      { message: 'API rate limit exceeded' },
      { status: 403, headers: { 'x-ratelimit-remaining': '0' } },
    );

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_RATE_LIMITED',
  );
});

test('rejeita outro 403 (não relacionado a limite) com GITHUB_UNAVAILABLE', async () => {
  const fetchStub: typeof fetch = async () =>
    jsonResponse(
      { message: 'Forbidden' },
      { status: 403, headers: { 'x-ratelimit-remaining': '10' } },
    );

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
});

test('rejeita erro 5xx do GitHub com GITHUB_UNAVAILABLE', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ message: 'Internal Server Error' }, { status: 500 });

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
});

test('rejeita erro de rede (fetch lança) com GITHUB_UNAVAILABLE', async () => {
  const fetchStub: typeof fetch = async () => {
    throw new TypeError('fetch failed');
  };

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
});

test('rejeita corpo JSON 200 igual a null com GITHUB_UNAVAILABLE', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse(null, { status: 200 });

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
});

test('rejeita corpo JSON 200 sem login/type (objeto vazio) com GITHUB_UNAVAILABLE', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({}, { status: 200 });

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
});

test('rejeita tipo de conta não previsto (Bot) com GITHUB_UNAVAILABLE', async () => {
  const fetchStub: typeof fetch = async () => jsonResponse({ login: 'dependabot', type: 'Bot' }, { status: 200 });

  await assert.rejects(
    () => fetchGithubUser('dependabot', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
});

test('rejeita JSON 200 sintaticamente inválido com GITHUB_UNAVAILABLE', async () => {
  const fetchStub: typeof fetch = async () => rawResponse('{ isso não é json', { status: 200 });

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
});

test('rejeita 403 de limite secundário (Retry-After sem x-ratelimit-remaining=0) com GITHUB_RATE_LIMITED', async () => {
  const fetchStub: typeof fetch = async () =>
    jsonResponse(
      { message: 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.' },
      { status: 403, headers: { 'retry-after': '30' } },
    );

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_RATE_LIMITED',
  );
});

test('rejeita 403 com mensagem de limite de requisições do GitHub sem cabeçalho de limite com GITHUB_RATE_LIMITED', async () => {
  const fetchStub: typeof fetch = async () =>
    jsonResponse({ message: 'API rate limit exceeded for 203.0.113.1.' }, { status: 403 });

  await assert.rejects(
    () => fetchGithubUser('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_RATE_LIMITED',
  );
});

test('monta URL /users/:username e cabeçalhos GitHub sem Authorization', async () => {
  let capturedUrl: unknown;
  let capturedInit: RequestInit | undefined;
  const fetchStub: typeof fetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return jsonResponse({ login: 'octocat', type: 'User' }, { status: 200 });
  };

  await fetchGithubUser('octocat', fetchStub);

  assert.equal(capturedUrl, 'https://api.github.com/users/octocat');
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Accept, 'application/vnd.github+json');
  assert.equal(headers['User-Agent'], 'github-timeline');
  assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal('Authorization' in headers, false);
});

// Tarefa 4: paginação de /users/:username/repos (CA-2).

function makeRepo(overrides: Partial<{
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  html_url: string;
  fork: boolean;
  private: boolean;
}> = {}) {
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

function reposResponse(
  repos: unknown[],
  init: { status?: number; linkHeader?: string } = {},
): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.linkHeader) {
    headers.link = init.linkHeader;
  }
  return new Response(JSON.stringify(repos), { status: init.status ?? 200, headers });
}

test('monta a primeira página com per_page=100&type=all e cabeçalhos GitHub sem Authorization', async () => {
  let capturedUrl: unknown;
  let capturedInit: RequestInit | undefined;
  const fetchStub: typeof fetch = async (url, init) => {
    capturedUrl = url;
    capturedInit = init;
    return reposResponse([]);
  };

  await fetchGithubRepos('octocat', fetchStub);

  assert.equal(capturedUrl, 'https://api.github.com/users/octocat/repos?per_page=100&type=all');
  const headers = capturedInit?.headers as Record<string, string>;
  assert.equal(headers.Accept, 'application/vnd.github+json');
  assert.equal(headers['User-Agent'], 'github-timeline');
  assert.equal(headers['X-GitHub-Api-Version'], '2022-11-28');
  assert.equal('Authorization' in headers, false);
});

test('reúne repositórios de duas páginas seguindo Link rel="next" sem truncar em 100 itens', async () => {
  const page1 = Array.from({ length: 100 }, (_, index) => makeRepo({ id: index + 1, name: `repo-${index + 1}` }));
  const page2 = Array.from({ length: 5 }, (_, index) => makeRepo({ id: 101 + index, name: `repo-${101 + index}` }));
  const nextPageUrl = 'https://api.github.com/users/octocat/repos?per_page=100&type=all&page=2';

  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    if (url === nextPageUrl) {
      return reposResponse(page2);
    }
    return reposResponse(page1, {
      linkHeader: `<${nextPageUrl}>; rel="next", <${nextPageUrl}>; rel="last"`,
    });
  };

  const repos = await fetchGithubRepos('octocat', fetchStub);

  assert.equal(repos.length, 105);
  assert.equal(calledUrls.length, 2);
  assert.equal(calledUrls[1], nextPageUrl);
});

test('não segue Link rel="next" apontando para host externo', async () => {
  const externalUrl = 'https://evil.example.com/users/octocat/repos?page=2';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${externalUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 1);
});

test('não segue Link rel="next" apontando para caminho fora de /users/:username/repos', async () => {
  const otherPathUrl = 'https://api.github.com/repos/octocat/algum-repo';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${otherPathUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 1);
});

test('não segue Link rel="next" apontando para repos de outro username', async () => {
  const otherUserUrl = 'https://api.github.com/users/other-user/repos?per_page=100&type=all&page=2';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${otherUserUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 1);
});

test('detecta Link rel="next" repetido e rejeita sem entrar em loop infinito', async () => {
  const loopUrl = 'https://api.github.com/users/octocat/repos?per_page=100&type=all&page=2';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${loopUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 2);
});

// Tarefa 4 (correção pós-revisão Kimi): o GitHub pagina /users/:username/repos
// com Link real no formato /user/<id>/repos (confirmado via curl real em
// https://api.github.com/users/octocat/repos?per_page=1&type=all), e a validação
// do Link precisa rejeitar porta não padrão e credenciais na URL em ambos os formatos.

test('segue Link real "/user/<id>/repos" (não "/users/<login>/repos") e reúne duas páginas distintas', async () => {
  const page1 = [makeRepo({ id: 1, name: 'repo-a' })];
  const page2 = [makeRepo({ id: 2, name: 'repo-b' })];
  const nextUrl = 'https://api.github.com/user/583231/repos?per_page=100&type=all&page=2';

  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    if (url === nextUrl) {
      return reposResponse(page2);
    }
    return reposResponse(page1, { linkHeader: `<${nextUrl}>; rel="next"` });
  };

  const repos = await fetchGithubRepos('octocat', fetchStub);

  assert.deepEqual(repos.map((repo) => repo.name), ['repo-a', 'repo-b']);
  assert.equal(calledUrls.length, 2);
  assert.equal(calledUrls[1], nextUrl);
});

test('rejeita Link rel="next" com porta não padrão no formato /users/:username/repos', async () => {
  const badUrl = 'https://api.github.com:4443/users/octocat/repos?per_page=100&type=all&page=2';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${badUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 1);
});

test('rejeita Link rel="next" com credenciais na URL no formato /users/:username/repos', async () => {
  const badUrl = 'https://user:senha@api.github.com/users/octocat/repos?per_page=100&type=all&page=2';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${badUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 1);
});

test('rejeita Link rel="next" com porta não padrão no formato /user/<id>/repos', async () => {
  const badUrl = 'https://api.github.com:4443/user/583231/repos?per_page=100&type=all&page=2';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${badUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 1);
});

test('rejeita Link rel="next" com credenciais na URL no formato /user/<id>/repos', async () => {
  const badUrl = 'https://user:senha@api.github.com/user/583231/repos?per_page=100&type=all&page=2';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    return reposResponse([makeRepo()], { linkHeader: `<${badUrl}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 1);
});

test('rejeita Link rel="next" que troca de id numérico entre páginas sem entrar em loop', async () => {
  const firstNext = 'https://api.github.com/user/583231/repos?per_page=100&type=all&page=2';
  const swappedNext = 'https://api.github.com/user/999999/repos?per_page=100&type=all&page=3';
  const calledUrls: unknown[] = [];
  const fetchStub: typeof fetch = async (url) => {
    calledUrls.push(url);
    if (url === firstNext) {
      return reposResponse([makeRepo({ id: 2 })], { linkHeader: `<${swappedNext}>; rel="next"` });
    }
    return reposResponse([makeRepo({ id: 1 })], { linkHeader: `<${firstNext}>; rel="next"` });
  };

  await assert.rejects(
    () => fetchGithubRepos('octocat', fetchStub),
    (error: unknown) => error instanceof GithubClientError && error.code === 'GITHUB_UNAVAILABLE',
  );
  assert.equal(calledUrls.length, 2);
});
