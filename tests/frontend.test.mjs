// Testes da Tarefa 10: comportamento da interface (CA-13, CA-14, CA-15, CA-16) sem navegador.
// Um DOM falso mínimo substitui o browser; `fetch` é um stub que devolve objetos `Response` reais.
// O setter de innerHTML do DOM falso lança erro, provando que dados da API nunca viram HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as ui from '../public/app.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------- DOM falso ----------

class FakeClassList {
  constructor(el) { this.el = el; }
  get set() { return new Set(this.el.className.split(/\s+/).filter(Boolean)); }
  contains(name) { return this.set.has(name); }
  add(...names) { const s = this.set; names.forEach((n) => s.add(n)); this.el.className = [...s].join(' '); }
  remove(...names) { const s = this.set; names.forEach((n) => s.delete(n)); this.el.className = [...s].join(' '); }
  toggle(name, force) {
    const on = force === undefined ? !this.contains(name) : Boolean(force);
    if (on) this.add(name); else this.remove(name);
    return on;
  }
}

class FakeElement {
  constructor(ownerDocument, tagName) {
    this.ownerDocument = ownerDocument;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = '';
    this.classList = new FakeClassList(this);
    this.hidden = false;
    this.disabled = false;
    this.value = '';
    this._text = '';
    this.scrollCalls = [];
    this.focusCalls = 0;
    const props = new Map();
    this.style = { setProperty: (k, v) => props.set(k, String(v)), getPropertyValue: (k) => props.get(k) ?? '' };
  }
  get id() { return this.attributes.get('id') ?? ''; }
  set id(v) { this.attributes.set('id', String(v)); }
  setAttribute(k, v) { if (k === 'class') this.className = String(v); else this.attributes.set(k, String(v)); }
  getAttribute(k) { return k === 'class' ? this.className : (this.attributes.has(k) ? this.attributes.get(k) : null); }
  hasAttribute(k) { return this.attributes.has(k); }
  removeAttribute(k) { this.attributes.delete(k); }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._text = String(v ?? ''); }
  set innerHTML(_v) { throw new Error('innerHTML não deve ser usado pela interface'); }
  get innerHTML() { throw new Error('innerHTML não deve ser usado pela interface'); }
  insertAdjacentHTML() { throw new Error('insertAdjacentHTML não deve ser usado pela interface'); }
  appendChild(child) {
    if (typeof child === 'string') { this._text += child; return child; }
    if (child.parentNode) child.parentNode.children = child.parentNode.children.filter((c) => c !== child);
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
  replaceChildren(...nodes) { this.textContent = ''; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((c) => c !== this); this.parentNode = null; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((f) => f !== fn)); }
  dispatchEvent(event) {
    event.target ??= this;
    event.currentTarget = this;
    for (const fn of this.listeners.get(event.type) ?? []) fn.call(this, event);
    return !event.defaultPrevented;
  }
  click() { this.dispatchEvent(makeEvent('click')); }
  focus() { this.focusCalls += 1; this.ownerDocument.activeElement = this; }
  scrollIntoView(options) { this.scrollCalls.push(options); }
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  querySelectorAll(tag) { return [...this.walk()].filter((el) => el.tagName === tag.toUpperCase()); }
  findAll(predicate) { return [...this.walk()].filter(predicate); }
  byClass(name) { return this.findAll((el) => el.classList.contains(name)); }
}

function makeEvent(type) {
  return { type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
}

// Elementos da página (ids verificados contra public/index.html em um teste abaixo).
const PAGE_IDS = {
  'timeline-form': 'form', username: 'input', 'submit-button': 'button', 'request-log': 'ol',
  status: 'p', error: 'div', 'error-code': 'p', 'error-message': 'p', 'error-hint': 'p',
  'canvas-caption': 'span', results: 'div', 'profile-username': 'h2', 'range-label': 'span',
  'stat-total': 'dd', 'stat-originals': 'dd', 'stat-forks': 'dd', 'stat-years': 'dd',
  'year-chart': 'div', 'timeline-groups': 'div', 'timeline-idle': 'p', 'timeline-empty': 'div',
};

function createFakeDocument() {
  const doc = {
    activeElement: null,
    createElement: (tag) => new FakeElement(doc, tag),
    getElementById: (id) => [...doc.body.walk()].find((el) => el.id === id) ?? null,
  };
  doc.body = new FakeElement(doc, 'body');
  for (const [id, tag] of Object.entries(PAGE_IDS)) {
    const el = doc.createElement(tag);
    el.id = id;
    doc.body.appendChild(el);
  }
  doc.getElementById('error').hidden = true;
  doc.getElementById('timeline-empty').hidden = true;
  doc.getElementById('submit-button').textContent = 'Gerar timeline';
  doc.getElementById('year-chart').appendChild(Object.assign(doc.createElement('p'), { className: 'placeholder' }));
  return doc;
}

// ---------- fetch stub com Response reais ----------

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function stubFetch(handler) {
  const calls = [];
  const fetchImpl = async (input, init) => {
    calls.push({ url: String(input), init });
    return handler(String(input), init, calls.length);
  };
  return { fetchImpl, calls };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

const flush = () => new Promise((r) => setImmediate(r));

function setup(handler, extra = {}) {
  const doc = createFakeDocument();
  const { fetchImpl, calls } = stubFetch(handler);
  const app = ui.createTimelineApp({ document: doc, fetch: fetchImpl, ...extra });
  const $ = (id) => doc.getElementById(id);
  const submit = async (login) => {
    $('username').value = login;
    const event = makeEvent('submit');
    $('timeline-form').dispatchEvent(event);
    await flush();
    await flush();
    return event;
  };
  return { doc, app, calls, $, submit };
}

const SAMPLE = {
  username: 'octo',
  total: 4,
  repositories: [
    { name: 'first', description: 'Primeiro projeto.', createdAt: '2019-03-11T14:02:00Z', url: 'https://github.com/octo/first', isFork: false },
    { name: 'no-desc', description: null, createdAt: '2019-12-31T23:30:00Z', url: 'https://github.com/octo/no-desc', isFork: false },
    { name: 'forked', description: 'Um fork.', createdAt: '2021-01-01T00:10:00Z', url: 'https://github.com/octo/forked', isFork: true },
    { name: 'last', description: 'Mais recente.', createdAt: '2021-06-30T16:40:00Z', url: 'https://github.com/octo/last', isFork: false },
  ],
  summaryByYear: [{ year: 2019, count: 2 }, { year: 2021, count: 2 }],
};

// ---------- Funções puras ----------

test('isValidUsername usa a mesma regra do back-end', () => {
  assert.equal(typeof ui.isValidUsername, 'function', 'public/app.js deve exportar isValidUsername');
  for (const ok of ['octo', 'a', 'octo-cat', 'A1-b2', 'x'.repeat(39)]) assert.equal(ui.isValidUsername(ok), true, ok);
  for (const bad of ['', '@', 'octo cat', '-octo', 'octo-', 'x'.repeat(40), 'octo_cat', 'oc/to']) assert.equal(ui.isValidUsername(bad), false, bad);
});

test('groupByYear agrupa pelo ano UTC preservando a ordem da API e a numeração global', () => {
  assert.equal(typeof ui.groupByYear, 'function', 'public/app.js deve exportar groupByYear');
  const groups = ui.groupByYear(SAMPLE.repositories);
  assert.deepEqual(groups.map((g) => g.year), [2019, 2021]);
  assert.deepEqual(groups[0].repositories.map((r) => r.name), ['first', 'no-desc']);
  assert.deepEqual(groups[1].repositories.map((r) => r.name), ['forked', 'last']);
  assert.deepEqual(groups.flatMap((g) => g.repositories.map((r) => r.index)), [1, 2, 3, 4]);
  assert.deepEqual(ui.groupByYear([]), []);
});

test('safeRepoUrl aceita somente https://github.com/', () => {
  assert.equal(typeof ui.safeRepoUrl, 'function', 'public/app.js deve exportar safeRepoUrl');
  assert.equal(ui.safeRepoUrl('https://github.com/octo/first'), 'https://github.com/octo/first');
  for (const bad of ['javascript:alert(1)', 'http://github.com/octo/x', 'https://evil.example/octo', 'https://github.com.evil.example/x', '//github.com/x', 'data:text/html,x', '', null, 42]) {
    assert.equal(ui.safeRepoUrl(bad), null, String(bad));
  }
});

test('parseTimeline rejeita JSON fora do contrato', () => {
  assert.equal(typeof ui.parseTimeline, 'function', 'public/app.js deve exportar parseTimeline');
  assert.deepEqual(ui.parseTimeline(SAMPLE), SAMPLE);
  assert.deepEqual(ui.parseTimeline({ username: 'o', total: 0, repositories: [], summaryByYear: [] }), { username: 'o', total: 0, repositories: [], summaryByYear: [] });
  const bads = [
    null, [], 'x', {},
    { ...SAMPLE, total: '4' },
    { ...SAMPLE, total: 3 },
    { ...SAMPLE, repositories: [{ ...SAMPLE.repositories[0], isFork: 'no' }, ...SAMPLE.repositories.slice(1)] },
    { ...SAMPLE, repositories: [{ ...SAMPLE.repositories[0], createdAt: 'ontem' }, ...SAMPLE.repositories.slice(1)] },
    { ...SAMPLE, repositories: [{ ...SAMPLE.repositories[0], description: 5 }, ...SAMPLE.repositories.slice(1)] },
    { ...SAMPLE, summaryByYear: [{ year: '2019', count: 2 }] },
  ];
  for (const bad of bads) assert.equal(ui.parseTimeline(bad), null, JSON.stringify(bad));
});

// ---------- Controlador com DOM ----------

test('não consulta a rede ao iniciar (sem pré-carga nem demonstração)', async () => {
  assert.equal(typeof ui.createTimelineApp, 'function', 'public/app.js deve exportar createTimelineApp');
  const { calls, $ } = setup(() => jsonResponse(SAMPLE));
  $('username').value = 'octo';
  await flush();
  assert.equal(calls.length, 0);
  assert.equal($('timeline-groups').children.length, 0);
});

test('envio válido consulta somente /api/timeline/:username e renderiza resumo, gráfico e timeline', async () => {
  const { calls, $, doc, submit } = setup(() => jsonResponse(SAMPLE));
  const event = await submit('  octo ');

  assert.equal(event.defaultPrevented, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/timeline/octo');
  assert.doesNotMatch(calls[0].url, /api\.github\.com/);

  assert.equal($('profile-username').textContent, '@octo');
  assert.equal($('stat-total').textContent, '4');
  assert.equal($('stat-originals').textContent, '3');
  assert.equal($('stat-forks').textContent, '1');
  assert.equal($('stat-years').textContent, '2');
  assert.match($('range-label').textContent, /2019.*2021/);
  assert.equal($('results').getAttribute('data-state'), 'ready');
  assert.equal($('error').hidden, true);
  assert.equal($('timeline-idle').hidden, true);
  assert.equal($('timeline-empty').hidden, true);
  assert.match($('status').textContent, /octo/);

  // Gráfico anual: um botão por ano de summaryByYear.
  const bars = $('year-chart').querySelectorAll('button');
  assert.deepEqual(bars.map((b) => b.getAttribute('data-year')), ['2019', '2021']);
  assert.ok(bars.every((b) => b.getAttribute('type') === 'button'));
  assert.ok(bars.every((b) => /\d+ reposit/.test(b.getAttribute('aria-label') ?? '')));
  assert.ok(bars.every((b) => /%$/.test(b.byClass('bar__fill')[0]?.style.getPropertyValue('--bar-h'))));

  // Timeline agrupada por ano, na ordem da API.
  const groups = $('timeline-groups').byClass('year-group');
  assert.deepEqual(groups.map((g) => g.id), ['ano-2019', 'ano-2021']);
  const links = $('timeline-groups').querySelectorAll('a');
  assert.deepEqual(links.map((a) => a.getAttribute('href')), SAMPLE.repositories.map((r) => r.url));
  for (const a of links) {
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
  }
  assert.deepEqual($('timeline-groups').byClass('repo__name').map((n) => n.textContent), ['first', 'no-desc', 'forked', 'last']);
  const descs = $('timeline-groups').byClass('repo__desc');
  assert.equal(descs[1].textContent, 'Sem descrição.');
  assert.ok(descs[1].classList.contains('repo__desc--empty'));
  const forkBadges = $('timeline-groups').byClass('repo__fork');
  assert.equal(forkBadges.length, 1);
  assert.equal(forkBadges[0].textContent, 'fork');
  assert.ok(links[2].classList.contains('repo--fork'));
  // Data em UTC: 2019-12-31T23:30Z continua em 2019 em qualquer fuso.
  assert.match(links[1].textContent, /31 DEZ 2019/);
  assert.match(links[0].textContent, /#001/);

  // Registro de requisições.
  const log = $('request-log').querySelectorAll('li');
  assert.equal(log.length, 1);
  assert.match(log[0].textContent, /GET.*\/api\/timeline\/octo.*200/);
  assert.equal(doc.getElementById('submit-button').disabled, false);
});

test('nome e descrição do GitHub entram como texto (XSS) e URL insegura não vira link', async () => {
  const evil = {
    username: 'octo',
    total: 2,
    repositories: [
      { name: '<img src=x onerror=alert(1)>', description: '<script>alert(2)</script>', createdAt: '2020-01-01T00:00:00Z', url: 'javascript:alert(3)', isFork: false },
      { name: 'ok', description: null, createdAt: '2020-02-01T00:00:00Z', url: 'https://github.com/octo/ok', isFork: false },
    ],
    summaryByYear: [{ year: 2020, count: 2 }],
  };
  const { $, submit } = setup(() => jsonResponse(evil));
  await submit('octo');

  const groups = $('timeline-groups');
  assert.equal(groups.findAll((el) => ['IMG', 'SCRIPT'].includes(el.tagName)).length, 0);
  assert.equal(groups.byClass('repo__name')[0].textContent, '<img src=x onerror=alert(1)>');
  assert.equal(groups.byClass('repo__desc')[0].textContent, '<script>alert(2)</script>');
  const hrefs = groups.findAll((el) => el.hasAttribute('href')).map((el) => el.getAttribute('href'));
  assert.deepEqual(hrefs, ['https://github.com/octo/ok']);
  assert.equal(groups.byClass('repo').length, 2, 'repositório com URL insegura continua listado, sem link');
});

test('login é codificado no caminho e inválido não chega à rede', async () => {
  const { calls, $, submit } = setup(() => jsonResponse(SAMPLE));
  await submit('oc to@');
  assert.equal(calls.length, 0);
  assert.equal($('error').hidden, false);
  assert.match($('error-code').textContent, /INVALID_USERNAME/);
  assert.match($('error-message').textContent, /inválido/i);
  assert.equal($('results').getAttribute('data-state'), 'error');

  await submit('');
  assert.equal(calls.length, 0);
  assert.equal($('error').hidden, false);

  assert.equal(ui.timelinePath('a-b'), '/api/timeline/a-b');
  assert.equal(ui.timelinePath('a/b?c'), '/api/timeline/a%2Fb%3Fc');
});

for (const [status, code, pattern] of [
  [400, 'INVALID_USERNAME', /inválido/i],
  [404, 'USER_NOT_FOUND', /não encontrada/i],
  [422, 'ORGANIZATION_NOT_SUPPORTED', /organiza/i],
  [429, 'GITHUB_RATE_LIMITED', /limite/i],
  [502, 'GITHUB_UNAVAILABLE', /falha/i],
]) {
  test(`HTTP ${status} da API mostra ${code} em pt-BR`, async () => {
    const { $, submit } = setup(() => jsonResponse({ error: { code, message: 'x' } }, status));
    await submit('octo');
    assert.equal($('error').hidden, false);
    assert.match($('error-code').textContent, new RegExp(`${status}.*${code}`));
    assert.match($('error-message').textContent, pattern);
    assert.notEqual($('error-hint').textContent, '');
    assert.equal($('results').getAttribute('data-state'), 'error');
    assert.equal($('timeline-groups').children.length, 0, 'erro não é mascarado por dados');
    assert.match($('request-log').textContent, new RegExp(String(status)));
    assert.equal($('submit-button').disabled, false);
  });
}

test('falha de rede, JSON inválido, contrato inesperado e status desconhecido mostram avisos', async () => {
  const cases = [
    [() => { throw new TypeError('fetch failed'); }, /conectar|rede/i],
    [() => new Response('<html>oops</html>', { status: 200, headers: { 'content-type': 'text/html' } }), /inesperad/i],
    [() => jsonResponse({ username: 'octo' }), /inesperad/i],
    [() => new Response('boom', { status: 500 }), /inesperad/i],
  ];
  for (const [handler, pattern] of cases) {
    const { $, submit } = setup(handler);
    await submit('octo');
    assert.equal($('error').hidden, false);
    assert.match($('error-message').textContent, pattern);
    assert.equal($('timeline-groups').children.length, 0);
    assert.equal($('submit-button').disabled, false);
  }
});

test('conta sem repositórios (200) mostra estado vazio', async () => {
  const { $, submit } = setup(() => jsonResponse({ username: 'vazio', total: 0, repositories: [], summaryByYear: [] }));
  await submit('vazio');
  assert.equal($('error').hidden, true);
  assert.equal($('timeline-empty').hidden, false);
  assert.equal($('timeline-idle').hidden, true);
  assert.equal($('timeline-groups').children.length, 0);
  assert.equal($('stat-total').textContent, '0');
  assert.equal($('stat-years').textContent, '0');
  assert.equal($('year-chart').querySelectorAll('button').length, 0);
  assert.equal($('results').getAttribute('data-state'), 'empty');
});

test('carregando: botão desabilitado, aria-busy e envio duplicado ignorado', async () => {
  const pending = deferred();
  const { calls, $, submit } = setup(() => pending.promise);
  await submit('octo');
  assert.equal($('submit-button').disabled, true);
  assert.match($('submit-button').textContent, /Consultando/);
  assert.equal($('results').getAttribute('aria-busy'), 'true');
  assert.equal($('results').getAttribute('data-state'), 'loading');

  await submit('octo');
  assert.equal(calls.length, 1, 'segundo envio durante carregamento é ignorado');

  pending.resolve(jsonResponse(SAMPLE));
  await flush(); await flush();
  assert.equal($('submit-button').disabled, false);
  assert.equal($('submit-button').textContent, 'Gerar timeline');
  assert.equal($('results').getAttribute('aria-busy'), 'false');
});

test('resposta antiga não substitui a consulta mais recente', async () => {
  const first = deferred();
  const second = deferred();
  const { calls, $, app } = setup((url) => (url.endsWith('/antigo') ? first.promise : second.promise));
  const p1 = app.load('antigo');
  const p2 = app.load('novo');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init?.signal?.aborted, true, 'consulta anterior é abortada');

  second.resolve(jsonResponse({ ...SAMPLE, username: 'novo' }));
  await p2;
  first.resolve(jsonResponse({ ...SAMPLE, username: 'antigo' }));
  await p1;
  await flush();
  assert.equal($('profile-username').textContent, '@novo');

  // Erro atrasado da consulta antiga também é ignorado.
  const late = deferred();
  const ok = deferred();
  const s2 = setup((url) => (url.endsWith('/antigo') ? late.promise : ok.promise));
  const q1 = s2.app.load('antigo');
  const q2 = s2.app.load('novo');
  ok.resolve(jsonResponse({ ...SAMPLE, username: 'novo' }));
  await q2;
  late.resolve(jsonResponse({ error: { code: 'USER_NOT_FOUND', message: 'x' } }, 404));
  await q1;
  assert.equal(s2.$('error').hidden, true);
  assert.equal(s2.$('profile-username').textContent, '@novo');
});

test('nova consulta remove o erro anterior', async () => {
  let n = 0;
  const { $, submit } = setup(() => (++n === 1 ? jsonResponse({ error: { code: 'USER_NOT_FOUND', message: 'x' } }, 404) : jsonResponse(SAMPLE)));
  await submit('ghost');
  assert.equal($('error').hidden, false);
  await submit('octo');
  assert.equal($('error').hidden, true);
  assert.equal($('error-code').textContent, '');
  assert.equal($('profile-username').textContent, '@octo');
});

test('clicar em um ano rola até o grupo e move o foco, inclusive com muitos anos', async () => {
  const years = Array.from({ length: 15 }, (_, i) => 2010 + i);
  const data = {
    username: 'octo',
    total: years.length,
    repositories: years.map((y) => ({ name: `r${y}`, description: null, createdAt: `${y}-05-01T00:00:00Z`, url: `https://github.com/octo/r${y}`, isFork: false })),
    summaryByYear: years.map((year) => ({ year, count: 1 })),
  };
  const { $, doc, submit } = setup(() => jsonResponse(data), { prefersReducedMotion: () => true });
  await submit('octo');

  const bars = $('year-chart').querySelectorAll('button');
  assert.equal(bars.length, 15);
  bars[12].click();
  const target = doc.getElementById('ano-2022');
  assert.equal(target.scrollCalls.length, 1);
  assert.equal(target.scrollCalls[0].behavior, 'auto', 'respeita prefers-reduced-motion');
  const heading = target.byClass('year-group__year')[0];
  assert.equal(heading.getAttribute('tabindex'), '-1');
  assert.equal(doc.activeElement, heading);
  assert.ok(bars[12].classList.contains('is-active'));
  assert.equal(bars[12].getAttribute('aria-pressed'), null, 'botão de salto não é toggle');
  assert.ok(target.classList.contains('is-active'));
});

// ---------- Estrutura estática ----------

test('public/index.html carrega /app.js como módulo e contém os ids usados pelo controlador', async () => {
  const html = await readFile(path.join(rootDir, 'public/index.html'), 'utf8');
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  for (const id of Object.keys(PAGE_IDS)) assert.ok(html.includes(`id="${id}"`), `#${id} na página`);
});

test('public/app.js não usa innerHTML, GitHub direto nem dados de demonstração', async () => {
  const js = await readFile(path.join(rootDir, 'public/app.js'), 'utf8');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
  assert.doesNotMatch(js, /api\.github\.com/);
  assert.doesNotMatch(js, /dotfiles|hello-world|portfolio-v1|github\.com\/demo/);
  assert.match(js, /['"`]\/api\/timeline\/['"`]\s*\+\s*encodeURIComponent\(/);
});

// ---------- Tarefa 11: movimento progressivo, progresso de leitura e reduced motion ----------
// Janela falsa com RAF manual, matchMedia controlável e IntersectionObserver opcional.

function listenerTarget(obj) {
  obj.listeners = new Map();
  obj.addEventListener = (type, fn, opts) => {
    if (!obj.listeners.has(type)) obj.listeners.set(type, []);
    obj.listeners.get(type).push({ fn, opts });
  };
  obj.removeEventListener = (type, fn) => {
    obj.listeners.set(type, (obj.listeners.get(type) ?? []).filter((l) => l.fn !== fn));
  };
  obj.fire = (type, event = {}) => { for (const l of [...(obj.listeners.get(type) ?? [])]) l.fn({ type, ...event }); };
  obj.count = (type) => (obj.listeners.get(type) ?? []).length;
  return obj;
}

function createFakeWindow({ reduced = false, io = true, width = 1280, height = 800, dpr = 2 } = {}) {
  const win = listenerTarget({ innerWidth: width, innerHeight: height, devicePixelRatio: dpr });
  let nextId = 0;
  win.frames = new Map();
  win.requestAnimationFrame = (fn) => { nextId += 1; win.frames.set(nextId, fn); return nextId; };
  win.cancelAnimationFrame = (id) => { win.frames.delete(id); };
  win.runFrame = (t = 16) => { const fns = [...win.frames.values()]; win.frames.clear(); fns.forEach((fn) => fn(t)); };
  const mql = listenerTarget({ matches: reduced, media: '(prefers-reduced-motion: reduce)' });
  mql.set = (value) => { mql.matches = value; mql.fire('change', { matches: value }); };
  win.reducedMotion = mql;
  win.matchMedia = () => mql;
  win.Path2D = class { constructor(d) { this.d = d; } };
  win.observers = [];
  if (io) {
    win.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); win.observers.push(this); }
      observe(el) { this.targets.add(el); }
      unobserve(el) { this.targets.delete(el); }
      disconnect() { this.targets.clear(); }
      trigger(isIntersecting) { this.callback([...this.targets].map((target) => ({ target, isIntersecting }))); }
    };
  }
  return win;
}

function createFakeContext() {
  const calls = {};
  const record = (name) => (...args) => { calls[name] = (calls[name] ?? 0) + 1; return args; };
  const ctx = { calls, globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1 };
  for (const name of ['clearRect', 'beginPath', 'moveTo', 'lineTo', 'closePath', 'stroke', 'fill', 'setTransform', 'scale']) ctx[name] = record(name);
  ctx.getImageData = (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) });
  return ctx;
}

// Monta a página com canvas e SVG; `canvasSupported: false` simula navegador sem canvas 2D.
function setupMotion({ canvasSupported = true, rect = { width: 600, height: 640 }, timelineRect = { top: 900, height: 2000 }, ...winOptions } = {}) {
  const doc = listenerTarget(createFakeDocument());
  doc.visibilityState = 'visible';
  const win = createFakeWindow(winOptions);
  const contexts = [];
  const makeCanvas = () => {
    const canvas = new FakeElement(doc, 'canvas');
    canvas.width = 300;
    canvas.height = 150;
    canvas.getBoundingClientRect = () => ({ top: 0, left: 0, ...rect });
    canvas.getContext = (type) => {
      if (!canvasSupported || type !== '2d') return null;
      const ctx = createFakeContext();
      contexts.push(ctx);
      return ctx;
    };
    return canvas;
  };
  const baseCreate = doc.createElement;
  doc.createElement = (tag) => (tag === 'canvas' ? makeCanvas() : baseCreate(tag));

  const visual = doc.createElement('div');
  visual.className = 'hero__visual';
  const mark = doc.createElement('svg');
  mark.className = 'hero__mark';
  const canvas = doc.createElement('canvas');
  canvas.id = 'hero-canvas';
  visual.append(mark, canvas);
  const progress = doc.createElement('div');
  progress.id = 'read-progress';
  progress.style.transform = 'scaleX(0)';
  const timeline = doc.createElement('section');
  timeline.id = 'timeline';
  timeline.getBoundingClientRect = () => ({ top: 0, height: 0, ...timelineRect });
  doc.body.append(visual, progress, timeline);

  assert.equal(typeof ui.createMotion, 'function', 'public/app.js deve exportar createMotion');
  const motion = ui.createMotion({ window: win, document: doc });
  const mainCtx = () => contexts.find((c) => c.calls.clearRect) ?? contexts[contexts.length - 1];
  return { doc, win, motion, visual, canvas, progress, timeline, contexts, mainCtx };
}

test('readingProgress limita o progresso entre 0 e 1 e tolera timeline ausente ou vazia', () => {
  assert.equal(typeof ui.readingProgress, 'function', 'public/app.js deve exportar readingProgress');
  assert.equal(ui.readingProgress(null, 800), 0);
  assert.equal(ui.readingProgress({ top: 400, height: 0 }, 800), 0);
  assert.equal(ui.readingProgress({ top: 2000, height: 1000 }, 800), 0);
  assert.equal(ui.readingProgress({ top: -100, height: 1000 }, 800), 0.5);
  assert.equal(ui.readingProgress({ top: -5000, height: 1000 }, 800), 1);
});

test('particleBudget reduz partículas e resolução do canvas em telas estreitas', () => {
  assert.equal(typeof ui.particleBudget, 'function', 'public/app.js deve exportar particleBudget');
  const mobile = ui.particleBudget({ width: 375, height: 320, dpr: 3 });
  const desktop = ui.particleBudget({ width: 640, height: 680, dpr: 2 });
  assert.ok(mobile.dpr <= 1.5, `dpr móvel ${mobile.dpr}`);
  assert.ok(desktop.dpr <= 2, `dpr desktop ${desktop.dpr}`);
  assert.ok(mobile.count > 0 && mobile.count <= 480, `partículas móveis ${mobile.count}`);
  assert.ok(desktop.count <= 1300 && desktop.count > mobile.count, `partículas desktop ${desktop.count}`);
  const broken = ui.particleBudget({ width: 0, height: 0, dpr: Number.NaN });
  assert.equal(broken.count, 0);
  assert.equal(broken.dpr, 1);
});

test('reduced motion: sem RAF nem canvas, SVG estático preservado e progresso ainda atualiza', () => {
  assert.equal(typeof ui.createMotion, 'function', 'public/app.js deve exportar createMotion');
  const { win, motion, visual, progress, contexts } = setupMotion({ reduced: true, timelineRect: { top: -100, height: 1000 } });
  assert.equal(win.frames.size, 0, 'nenhum requestAnimationFrame com reduced motion');
  assert.equal(contexts.length, 0, 'canvas não é inicializado');
  assert.equal(visual.classList.contains('has-canvas'), false, 'SVG estático continua visível');

  win.fire('scroll');
  assert.equal(progress.style.transform, 'scaleX(0.5)');
  motion.setLoading(true);
  motion.showResult(12);
  motion.setLoading(false);
  assert.equal(win.frames.size, 0);
});

test('progresso de leitura acompanha scroll e resize sem exceção com timeline vazia ou ausente', () => {
  const s = setupMotion({ timelineRect: { top: 400, height: 0 } });
  assert.doesNotThrow(() => s.win.fire('scroll'));
  assert.equal(s.progress.style.transform, 'scaleX(0)');
  s.timeline.getBoundingClientRect = () => ({ top: -100, height: 1000 });
  s.win.fire('resize');
  assert.equal(s.progress.style.transform, 'scaleX(0.5)');
  s.timeline.remove();
  assert.doesNotThrow(() => s.win.fire('scroll'));
  assert.equal(s.progress.style.transform, 'scaleX(0)');
  assert.equal(s.win.listeners.get('scroll')[0].opts?.passive, true, 'listener de scroll passivo');
});

test('sem canvas 2D a página mantém o SVG e não agenda animação', () => {
  const { win, visual, progress } = setupMotion({ canvasSupported: false, timelineRect: { top: -100, height: 1000 } });
  assert.equal(win.frames.size, 0);
  assert.equal(visual.classList.contains('has-canvas'), false);
  win.fire('scroll');
  assert.equal(progress.style.transform, 'scaleX(0.5)');
});

test('canvas anima com um único RAF, pausa em aba oculta/navegação e limpa tudo ao destruir', () => {
  const { doc, win, motion, visual, mainCtx } = setupMotion();
  assert.ok(visual.classList.contains('has-canvas'), 'canvas ativo oculta o SVG de fallback');
  assert.equal(win.frames.size, 1);
  win.runFrame(16);
  assert.ok(mainCtx().calls.stroke > 0 || mainCtx().calls.fill > 0, 'desenha partículas triangulares');
  assert.ok(mainCtx().calls.lineTo >= 2 * mainCtx().calls.beginPath, 'cada partícula é um triângulo');
  assert.equal(win.frames.size, 1, 'um quadro por vez');

  motion.setLoading(true);
  motion.showResult(4);
  motion.setLoading(false);
  assert.equal(win.frames.size, 1, 'mudança de estado não duplica o loop');

  doc.visibilityState = 'hidden';
  doc.fire('visibilitychange');
  assert.equal(win.frames.size, 0, 'aba oculta pausa o loop');
  doc.visibilityState = 'visible';
  doc.fire('visibilitychange');
  doc.fire('visibilitychange');
  assert.equal(win.frames.size, 1, 'retomar não duplica o loop');

  win.fire('pagehide');
  assert.equal(win.frames.size, 0, 'navegar para fora pausa o loop');
  win.fire('pageshow');
  assert.equal(win.frames.size, 1);

  assert.equal(win.count('scroll'), 1);
  assert.equal(win.count('resize'), 1);
  motion.destroy();
  motion.destroy();
  assert.equal(win.frames.size, 0);
  assert.equal(win.count('scroll'), 0);
  assert.equal(win.count('resize'), 0);
  assert.equal(win.count('pagehide'), 0);
  assert.equal(doc.count('visibilitychange'), 0);
  assert.equal(win.reducedMotion.count('change'), 0);
  assert.equal(visual.classList.contains('has-canvas'), false);
});

test('em tela estreita o canvas usa menos pixels e menos partículas', () => {
  const { win, canvas, mainCtx } = setupMotion({ width: 375, height: 700, dpr: 3, rect: { width: 375, height: 320 } });
  assert.ok(canvas.width <= Math.round(375 * 1.5), `largura em pixels ${canvas.width}`);
  assert.ok(canvas.height <= Math.round(320 * 1.5), `altura em pixels ${canvas.height}`);
  win.runFrame(16);
  assert.ok(mainCtx().calls.beginPath <= 480, `partículas desenhadas ${mainCtx().calls.beginPath}`);
});

test('ativar reduced motion em execução para o loop e devolve o SVG; desativar retoma', () => {
  const { win, visual } = setupMotion();
  assert.equal(win.frames.size, 1);
  win.reducedMotion.set(true);
  assert.equal(win.frames.size, 0);
  assert.equal(visual.classList.contains('has-canvas'), false);
  win.fire('pageshow');
  assert.equal(win.frames.size, 0, 'reduced motion prevalece sobre pageshow');
  win.reducedMotion.set(false);
  assert.equal(win.frames.size, 1);
  assert.ok(visual.classList.contains('has-canvas'));
});

// Alguns navegadores (ex.: emulação via CDP) mudam `matches` sem disparar `change` no listener da app.
test('reduced motion ativado sem evento change é detectado no próximo quadro e para o loop', () => {
  const { win, doc, motion, visual } = setupMotion();
  const chart = doc.getElementById('year-chart');
  motion.revealChart(chart);
  assert.ok(chart.classList.contains('is-pending'));
  assert.equal(win.frames.size, 1);

  win.reducedMotion.matches = true;
  win.runFrame(16);
  assert.equal(win.frames.size, 0, 'RAF não continua em reduced motion');
  assert.equal(visual.classList.contains('has-canvas'), false, 'SVG estático volta a aparecer');
  assert.equal(chart.classList.contains('is-pending'), false, 'barras pendentes são reveladas');
  win.fire('scroll');
  assert.equal(win.frames.size, 0, 'sem polling em reduced motion');

  // Desativado também sem evento: retoma em resize, sem duplicar o loop.
  win.reducedMotion.matches = false;
  win.fire('resize');
  win.fire('resize');
  assert.equal(win.frames.size, 1);
  assert.ok(visual.classList.contains('has-canvas'));
});

test('revelação das barras nunca deixa conteúdo invisível sem IntersectionObserver ou com reduced motion', () => {
  const withIo = setupMotion();
  const chart = withIo.doc.getElementById('year-chart');
  withIo.motion.revealChart(chart);
  assert.ok(chart.classList.contains('is-pending'), 'barras aguardam entrar na tela');
  const observer = withIo.win.observers.find((o) => o.targets.has(chart));
  assert.ok(observer, 'gráfico observado');
  observer.trigger(true);
  assert.equal(chart.classList.contains('is-pending'), false);
  assert.equal(observer.targets.has(chart), false, 'observação encerrada após revelar');

  const noIo = setupMotion({ io: false });
  const chart2 = noIo.doc.getElementById('year-chart');
  noIo.motion.revealChart(chart2);
  assert.equal(chart2.classList.contains('is-pending'), false);

  const reduced = setupMotion({ reduced: true });
  const chart3 = reduced.doc.getElementById('year-chart');
  reduced.motion.revealChart(chart3);
  assert.equal(chart3.classList.contains('is-pending'), false);

  // Reduced motion ativado depois: barras pendentes são reveladas imediatamente.
  const later = setupMotion();
  const chart4 = later.doc.getElementById('year-chart');
  later.motion.revealChart(chart4);
  later.win.reducedMotion.set(true);
  assert.equal(chart4.classList.contains('is-pending'), false);
});

test('a consulta informa o movimento, mas falhas do movimento não bloqueiam a API', async () => {
  const events = [];
  const motion = {
    setLoading: (on) => events.push(`loading:${on}`),
    showResult: (total) => events.push(`result:${total}`),
    revealChart: (chart) => events.push(`reveal:${chart.id}`),
    refresh: () => events.push('refresh'),
  };
  const ok = setup(() => jsonResponse(SAMPLE), { motion });
  await ok.submit('octo');
  assert.deepEqual(events, ['loading:true', 'loading:false', 'result:4', 'reveal:year-chart', 'refresh']);

  events.length = 0;
  const failing = setup(() => jsonResponse({ error: { code: 'USER_NOT_FOUND', message: 'x' } }, 404), { motion });
  await failing.submit('ghost');
  assert.ok(events.includes('loading:false'));
  assert.ok(!events.some((e) => e.startsWith('result:')), 'erro não dispara destaque de resultado');

  const broken = new Proxy({}, { get: () => () => { throw new Error('canvas quebrou'); } });
  const s = setup(() => jsonResponse(SAMPLE), { motion: broken });
  await s.submit('octo');
  assert.equal(s.$('profile-username').textContent, '@octo');
  assert.equal(s.$('timeline-groups').byClass('year-group').length, 2);
  assert.equal(s.$('submit-button').disabled, false);
});

test('styles.css só oculta o SVG com canvas ativo e define barras pendentes', async () => {
  const css = await readFile(path.join(rootDir, 'public/styles.css'), 'utf8');
  assert.match(css, /\.hero__visual\.has-canvas\s+\.hero__mark\s*\{[^}]*(opacity:\s*0|display:\s*none|visibility:\s*hidden)/);
  assert.match(css, /\.chart\.is-pending\s+\.bar__fill\s*\{[^}]*height:\s*0/);
  assert.match(css, /\.progress\s*\{[^}]*will-change:\s*transform/);
});

test('README documenta execução da interface, erros sem token, testes e limites', async () => {
  const readme = await readFile(path.join(rootDir, 'README.md'), 'utf8');
  for (const needle of ['npm ci', 'npm run build', 'npm start', 'http://127.0.0.1:3000/', 'node --test tests/frontend.test.mjs', 'npm test', 'npm run typecheck', 'prefers-reduced-motion', 'GITHUB_RATE_LIMITED']) {
    assert.ok(readme.includes(needle), `README menciona ${needle}`);
  }
  assert.match(readme, /login/i);
  assert.match(readme, /sem token/i);
  assert.doesNotMatch(readme, /Sem front-end/i, 'README não afirma mais que não há front-end');
});
