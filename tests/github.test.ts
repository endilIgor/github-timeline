// Teste da Tarefa 3: busca de perfil GitHub via fetch injetável e classificação de erros (CA-8, CA-9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGithubUser, GithubClientError } from '../src/github.js';

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
