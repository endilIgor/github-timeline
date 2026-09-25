// Teste da Tarefa 9: interface servida pelo mesmo app Hono (CA-12) — HTML na raiz, CSS próprio
// com a identidade visual do design, marcação acessível e contrato /api/* preservado, sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function failingFetch(calls: string[]): typeof fetch {
  return async (input) => {
    calls.push(String(input));
    throw new Error('a interface estática não deve consultar o GitHub');
  };
}

async function getText(path: string, calls: string[] = []): Promise<{ response: Response; body: string }> {
  const app = createApp({ fetchImpl: failingFetch(calls), corsOrigins: [] });
  const response = await app.request(path);
  return { response, body: await response.text() };
}

test('GET / serve o HTML da interface com content-type text/html', async () => {
  const calls: string[] = [];
  const { response, body } = await getText('/', calls);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html; charset=utf-8/i);
  assert.match(body, /^<!doctype html>/i);
  assert.match(body, /<html lang="pt-BR">/);
  assert.match(body, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(body, /<link rel="stylesheet" href="\/styles\.css">/);
  assert.deepEqual(calls, []);
});

test('GET /styles.css serve o CSS com content-type text/css e a identidade visual do design', async () => {
  const { response, body } = await getText('/styles.css');

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/css; charset=utf-8/i);
  assert.match(body, /#8052ff/i);
  assert.match(body, /#ffb829/i);
  assert.match(body, /background(-color)?:\s*#000\b/i);
  assert.match(body, /font-family:\s*'Geist',[^;]*sans-serif/);
  assert.match(body, /'Geist Mono',[^;]*monospace/);
  assert.match(body, /@media \(max-width:/);
  assert.match(body, /@media \(prefers-reduced-motion: reduce\)/);
});

test('a página tem cabeçalho, formulário rotulado, canvas decorativo e seções do design', async () => {
  const { body } = await getText('/');

  // Navegação e âncoras das seções.
  assert.match(body, /<nav[^>]*aria-label="[^"]+"/);
  for (const anchor of ['#anos', '#timeline', '#api']) {
    assert.ok(body.includes(`href="${anchor}"`), `link de navegação para ${anchor}`);
  }
  assert.equal((body.match(/<h1[\s>]/g) ?? []).length, 1, 'exatamente um h1');

  // Formulário acessível com ids previsíveis para a Tarefa 10.
  assert.match(body, /<form[^>]*id="timeline-form"/);
  assert.match(body, /<label[^>]*for="username"/);
  assert.match(body, /<input[^>]*id="username"[^>]*name="username"/);
  assert.match(body, /<button[^>]*type="submit"[^>]*id="submit-button"/);
  assert.match(body, /id="status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(body, /id="error"[^>]*role="alert"[^>]*hidden/);

  // Espaço reservado para o canvas decorativo, fora da árvore de acessibilidade.
  assert.match(body, /<canvas[^>]*id="hero-canvas"[^>]*aria-hidden="true"/);

  // Seções de resultado, gráfico anual, timeline e explicação da API.
  assert.match(body, /id="results"/);
  for (const id of ['stat-total', 'stat-originals', 'stat-forks', 'stat-years', 'year-chart', 'timeline-groups', 'timeline-empty']) {
    assert.ok(body.includes(`id="${id}"`), `elemento #${id} reservado`);
  }
  assert.match(body, /<section[^>]*id="anos"/);
  assert.match(body, /<section[^>]*id="timeline"/);
  assert.match(body, /<section[^>]*id="api"/);
  for (const code of ['INVALID_USERNAME', 'USER_NOT_FOUND', 'ORGANIZATION_NOT_SUPPORTED', 'GITHUB_RATE_LIMITED', 'GITHUB_UNAVAILABLE']) {
    assert.ok(body.includes(code), `código de erro ${code} documentado`);
  }
  assert.match(body, /<footer[\s>]/);
});

test('a página não usa runtime do Claude Design, CDN de React nem dados fictícios', async () => {
  const { body } = await getText('/');

  assert.doesNotMatch(body, /<x-dc|support\.js|text\/x-dc|DCLogic/);
  assert.doesNotMatch(body, /unpkg|jsdelivr|react(-dom)?(\.production)?(\.min)?\.js/i);
  assert.doesNotMatch(body, /<script[^>]+src="https?:/i);
  assert.doesNotMatch(body, /fetch\(\s*['"`]https:\/\/api\.github\.com/);
  // Nenhum repositório de demonstração do protótipo aparece como resultado.
  for (const demo of ['dotfiles', 'hello-world', 'portfolio-v1', 'github.com/demo/']) {
    assert.ok(!body.includes(demo), `dado de demonstração "${demo}" não deve estar na página`);
  }
  assert.doesNotMatch(body, /id="timeline-groups"[^>]*>\s*<[^/]/, 'grupos da timeline começam vazios');
});

test('rotas estáticas não capturam /api/*: contrato de erro e sucesso preservados', async () => {
  const calls: string[] = [];
  const invalid = await getText('/api/timeline/%40', calls);
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.response.headers.get('content-type') ?? '', /application\/json/);
  assert.equal((JSON.parse(invalid.body) as { error: { code: string } }).error.code, 'INVALID_USERNAME');
  assert.deepEqual(calls, []);

  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    const body = url.includes('/repos') ? [] : { login: 'octo', type: 'User' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const app = createApp({ fetchImpl, corsOrigins: [] });
  const ok = await app.request('/api/timeline/octo');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { username: 'octo', total: 0, repositories: [], summaryByYear: [] });

  const unknownApi = await app.request('/api/desconhecido');
  assert.equal(unknownApi.status, 404);
  assert.doesNotMatch(unknownApi.headers.get('content-type') ?? '', /text\/html/);
});

// Tarefa 10: o JS da interface é servido pela mesma origem (CA-12) e chama só a API local (CA-13).
test('GET /app.js serve o módulo da interface com content-type JavaScript', async () => {
  const calls: string[] = [];
  const { response, body } = await getText('/app.js', calls);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/javascript; charset=utf-8/i);
  assert.match(body, /export function createTimelineApp/);
  assert.match(body, /\/api\/timeline\//);
  assert.doesNotMatch(body, /api\.github\.com/);
  assert.deepEqual(calls, []);

  const page = await getText('/');
  assert.match(page.body, /<script type="module" src="\/app\.js"><\/script>/);
});

test('caminhos desconhecidos fora da API respondem 404 em vez de servir a página', async () => {
  const { response } = await getText('/nao-existe');
  assert.equal(response.status, 404);
});
