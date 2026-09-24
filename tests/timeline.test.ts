// Teste da Tarefa 6: projeção da timeline e resumo anual a partir de repositórios GitHub (CA-1, CA-4, CA-5, CA-6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline } from '../src/timeline.js';
import type { GithubRepo } from '../src/github.js';

function repo(overrides: Partial<GithubRepo> & Pick<GithubRepo, 'id' | 'name' | 'created_at'>): GithubRepo {
  return {
    description: null,
    html_url: `https://github.com/octocat/${overrides.name}`,
    fork: false,
    private: false,
    ...overrides,
  };
}

test('mapeia campos exatos de cada repositório e do envelope (CA-1)', () => {
  const repos: GithubRepo[] = [
    repo({
      id: 1,
      name: 'alpha',
      description: 'Primeiro projeto',
      created_at: '2020-05-10T12:00:00Z',
      html_url: 'https://github.com/octocat/alpha',
      fork: false,
    }),
  ];

  const timeline = buildTimeline('octocat', repos);

  assert.deepEqual(Object.keys(timeline).sort(), ['repositories', 'summaryByYear', 'total', 'username']);
  assert.equal(timeline.username, 'octocat');
  assert.equal(timeline.total, 1);
  assert.equal(timeline.repositories.length, 1);

  const [mapped] = timeline.repositories;
  assert.deepEqual(Object.keys(mapped).sort(), ['createdAt', 'description', 'isFork', 'name', 'url']);
  assert.equal(mapped.name, 'alpha');
  assert.equal(mapped.description, 'Primeiro projeto');
  assert.equal(mapped.createdAt, '2020-05-10T12:00:00Z');
  assert.equal(mapped.url, 'https://github.com/octocat/alpha');
  assert.equal(mapped.isFork, false);
});

test('preserva description null sem descartar o repositório (CA-1, CA-3)', () => {
  const repos: GithubRepo[] = [
    repo({ id: 1, name: 'sem-descricao', created_at: '2021-01-01T00:00:00Z', description: null }),
  ];

  const timeline = buildTimeline('octocat', repos);

  assert.equal(timeline.repositories[0].description, null);
});

test('ordena por createdAt crescente, mais antigo primeiro (CA-4)', () => {
  const repos: GithubRepo[] = [
    repo({ id: 1, name: 'recente', created_at: '2022-06-01T00:00:00Z' }),
    repo({ id: 2, name: 'antigo', created_at: '2019-01-01T00:00:00Z' }),
    repo({ id: 3, name: 'meio', created_at: '2020-03-15T00:00:00Z' }),
  ];

  const timeline = buildTimeline('octocat', repos);

  assert.deepEqual(
    timeline.repositories.map((r) => r.name),
    ['antigo', 'meio', 'recente'],
  );
});

test('desempata timestamps iguais pelo nome crescente, de forma determinística (CA-4)', () => {
  const repos: GithubRepo[] = [
    repo({ id: 1, name: 'zeta', created_at: '2020-01-01T00:00:00Z' }),
    repo({ id: 2, name: 'alpha', created_at: '2020-01-01T00:00:00Z' }),
    repo({ id: 3, name: 'mike', created_at: '2020-01-01T00:00:00Z' }),
  ];

  const timeline = buildTimeline('octocat', repos);

  assert.deepEqual(
    timeline.repositories.map((r) => r.name),
    ['alpha', 'mike', 'zeta'],
  );
});

test('conta vazia retorna total 0, repositories [] e summaryByYear [] (CA-5)', () => {
  const timeline = buildTimeline('octocat', []);

  assert.equal(timeline.total, 0);
  assert.deepEqual(timeline.repositories, []);
  assert.deepEqual(timeline.summaryByYear, []);
});

test('agrupa por ano UTC mesmo com timestamps com timezone perto da virada do ano (CA-6)', () => {
  const repos: GithubRepo[] = [
    // 2019-12-31T23:30 em -02:00 => 2020-01-01T01:30 UTC => ano 2020.
    repo({ id: 1, name: 'vespera-utc-2020', created_at: '2019-12-31T23:30:00-02:00' }),
    // 2020-01-01T00:30 em +03:00 => 2019-12-31T21:30 UTC => ano 2019.
    repo({ id: 2, name: 'madrugada-utc-2019', created_at: '2020-01-01T00:30:00+03:00' }),
    repo({ id: 3, name: 'meio-2021', created_at: '2021-06-15T10:00:00Z' }),
  ];

  const timeline = buildTimeline('octocat', repos);

  assert.deepEqual(timeline.summaryByYear, [
    { year: 2019, count: 1 },
    { year: 2020, count: 1 },
    { year: 2021, count: 1 },
  ]);

  assert.deepEqual(
    timeline.repositories.map((r) => r.name),
    ['madrugada-utc-2019', 'vespera-utc-2020', 'meio-2021'],
  );
});

test('summaryByYear fica em ordem crescente de ano, pares corretos, soma igual a total (CA-6)', () => {
  const repos: GithubRepo[] = [
    repo({ id: 1, name: 'b-2021', created_at: '2021-03-01T00:00:00Z' }),
    repo({ id: 2, name: 'a-2019', created_at: '2019-07-01T00:00:00Z' }),
    repo({ id: 3, name: 'c-2021', created_at: '2021-09-01T00:00:00Z' }),
    repo({ id: 4, name: 'd-2020', created_at: '2020-12-31T23:59:59Z' }),
    repo({ id: 5, name: 'e-2021', created_at: '2021-01-01T00:00:00Z' }),
  ];

  const timeline = buildTimeline('octocat', repos);

  assert.deepEqual(timeline.summaryByYear, [
    { year: 2019, count: 1 },
    { year: 2020, count: 1 },
    { year: 2021, count: 3 },
  ]);

  const summedCount = timeline.summaryByYear.reduce((sum, entry) => sum + entry.count, 0);
  assert.equal(summedCount, timeline.total);
  assert.equal(timeline.total, 5);
});

test('preserva createdAt como ISO 8601 original recebido do GitHub', () => {
  const repos: GithubRepo[] = [
    repo({ id: 1, name: 'iso', created_at: '2023-02-28T15:45:30Z' }),
  ];

  const timeline = buildTimeline('octocat', repos);

  assert.equal(timeline.repositories[0].createdAt, '2023-02-28T15:45:30Z');
});
