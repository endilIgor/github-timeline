// Interface da timeline (Tarefa 10, CA-13 a CA-16): consulta somente /api/timeline/:username na mesma
// origem e monta o DOM com createElement/textContent — dados da API nunca são interpretados como HTML.
// Sem pré-carga de rede e sem dados de demonstração: a página só consulta após envio explícito.

const MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const USERNAME_MAX_LENGTH = 39;
const USERNAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
const LOG_LIMIT = 3;
const IDLE_LABEL = 'Gerar timeline';
const LOADING_LABEL = 'Consultando…';

// Mensagens em pt-BR por código de erro da API (seção 4 da spec) e falhas locais do navegador.
const ERRORS = {
  INVALID_USERNAME: { http: 400, message: 'Nome de usuário inválido.', hint: 'Use letras, números e hífens — até 39 caracteres, sem espaço ou @.' },
  USER_NOT_FOUND: { http: 404, message: 'Conta GitHub não encontrada.', hint: 'Confira a grafia do login.' },
  ORGANIZATION_NOT_SUPPORTED: { http: 422, message: 'Contas de organização não são suportadas.', hint: 'A timeline funciona apenas com contas pessoais.' },
  GITHUB_RATE_LIMITED: { http: 429, message: 'Limite de requisições do GitHub atingido.', hint: 'Consultas sem token têm limite por IP. Tente novamente em alguns minutos.' },
  GITHUB_UNAVAILABLE: { http: 502, message: 'Falha ao consultar a API do GitHub.', hint: 'O GitHub não respondeu como esperado. Tente novamente.' },
  NETWORK_ERROR: { http: null, message: 'Não foi possível conectar à API local.', hint: 'Verifique se o servidor está em execução e tente novamente.' },
  UNEXPECTED_RESPONSE: { http: null, message: 'Resposta inesperada da API local.', hint: 'O conteúdo recebido não segue o contrato da timeline.' },
};
const CODE_BY_STATUS = { 400: 'INVALID_USERNAME', 404: 'USER_NOT_FOUND', 422: 'ORGANIZATION_NOT_SUPPORTED', 429: 'GITHUB_RATE_LIMITED', 502: 'GITHUB_UNAVAILABLE' };

export function isValidUsername(username) {
  return typeof username === 'string'
    && username.length > 0
    && username.length <= USERNAME_MAX_LENGTH
    && USERNAME_PATTERN.test(username);
}

export function timelinePath(login) {
  return '/api/timeline/' + encodeURIComponent(login);
}

// Só aceita links https para github.com; qualquer outro esquema/host é descartado.
export function safeRepoUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://github.com/')) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com' ? parsed.href : null;
  } catch {
    return null;
  }
}

const isInteger = (value) => Number.isInteger(value) && value >= 0;
const isIsoDate = (value) => typeof value === 'string' && !Number.isNaN(Date.parse(value));

function isRepository(repo) {
  return repo !== null && typeof repo === 'object'
    && typeof repo.name === 'string'
    && (repo.description === null || typeof repo.description === 'string')
    && isIsoDate(repo.createdAt)
    && typeof repo.url === 'string'
    && typeof repo.isFork === 'boolean';
}

// Valida o JSON de sucesso contra o contrato (CA-1); devolve null se algo estiver fora dele.
export function parseTimeline(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return null;
  }
  const { username, total, repositories, summaryByYear } = data;
  const valid = typeof username === 'string'
    && isInteger(total)
    && Array.isArray(repositories)
    && repositories.length === total
    && repositories.every(isRepository)
    && Array.isArray(summaryByYear)
    && summaryByYear.every((s) => s !== null && typeof s === 'object' && isInteger(s.year) && isInteger(s.count));
  return valid ? data : null;
}

const utcYear = (iso) => new Date(iso).getUTCFullYear();

// Agrupa pelo ano UTC mantendo a ordem devolvida pela API; `index` é a posição global (1-based).
export function groupByYear(repositories) {
  const groups = [];
  repositories.forEach((repo, i) => {
    const year = utcYear(repo.createdAt);
    let group = groups[groups.length - 1];
    if (!group || group.year !== year) {
      group = groups.find((g) => g.year === year);
      if (!group) {
        group = { year, repositories: [] };
        groups.push(group);
      }
    }
    group.repositories.push({ ...repo, index: i + 1 });
  });
  return groups;
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function createTimelineApp({ document: doc, window: win = globalThis.window, fetch: fetchImpl, prefersReducedMotion = () => false, motion = null }) {
  const $ = (id) => doc.getElementById(id);
  const form = $('timeline-form');
  const input = $('username');
  const button = $('submit-button');
  const results = $('results');

  let currentRequest = 0;
  let controller = null;
  let loading = false;
  const chart = $('year-chart');
  const yearNavigation = $('year-navigation');

  function updateYearNavigation() {
    const maxScroll = Math.max(0, chart.scrollWidth - chart.clientWidth);
    const hasYears = chart.children.length > 0 && chart.children[0].tagName === 'BUTTON';
    const overflow = hasYears && maxScroll > 1;
    yearNavigation.hidden = !overflow;
    $('year-prev').disabled = !overflow || chart.scrollLeft <= 1;
    $('year-next').disabled = !overflow || chart.scrollLeft >= maxScroll - 1;
    $('year-progress').style.setProperty('--year-position', `${overflow ? Math.round(Math.min(1, Math.max(0, chart.scrollLeft / maxScroll)) * 100) : 0}%`);
  }

  chart.addEventListener('scroll', updateYearNavigation, { passive: true });
  win?.addEventListener?.('resize', updateYearNavigation);
  for (const [id, direction] of [['year-prev', -1], ['year-next', 1]]) {
    $(id).addEventListener('click', () => chart.scrollBy({
      left: direction * Math.round(chart.clientWidth * 0.8),
      behavior: prefersReducedMotion() ? 'instant' : 'smooth',
    }));
  }

  // Movimento é decorativo (Tarefa 11): qualquer falha dele é ignorada para não bloquear a consulta.
  function notifyMotion(name, ...args) {
    try {
      motion?.[name]?.(...args);
    } catch {
      // sem efeito na interface
    }
  }

  function el(tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setState(state) {
    results.setAttribute('data-state', state);
    results.setAttribute('aria-busy', state === 'loading' ? 'true' : 'false');
  }

  function setLoading(on) {
    if (loading !== on) notifyMotion('setLoading', on);
    loading = on;
    button.disabled = on;
    button.textContent = on ? LOADING_LABEL : IDLE_LABEL;
  }

  function announce(message) {
    $('status').textContent = message;
  }

  function setCaption(text) {
    const caption = $('canvas-caption');
    if (caption) caption.textContent = text;
  }

  // Registro visual das requisições (últimas LOG_LIMIT), no estilo do protótipo.
  function log(method, path, status, tone) {
    const list = $('request-log');
    const item = el('li');
    const statusEl = el('span', `log__status${tone ? ` log__status--${tone}` : ''}`, status);
    item.append(el('span', 'log__method', method), el('span', 'log__path', path), statusEl);
    list.appendChild(item);
    while (list.children.length > LOG_LIMIT) list.children[0].remove();
    return (next, nextTone) => {
      statusEl.textContent = next;
      statusEl.className = `log__status log__status--${nextTone}`;
    };
  }

  function clearError() {
    $('error').hidden = true;
    $('error-code').textContent = '';
    $('error-message').textContent = '';
    $('error-hint').textContent = '';
  }

  function showError(code, httpStatus) {
    const info = ERRORS[code];
    const status = httpStatus ?? info.http;
    $('error-code').textContent = status ? `${status} · ${code}` : code;
    $('error-message').textContent = info.message;
    $('error-hint').textContent = info.hint;
    $('error').hidden = false;
    resetResults();
    setState('error');
    announce(info.message);
    setCaption('aguardando usuário');
    notifyMotion('refresh');
  }

  function resetResults() {
    $('profile-username').textContent = '@—';
    $('range-label').textContent = '—';
    for (const id of ['stat-total', 'stat-originals', 'stat-forks', 'stat-years']) $(id).textContent = '—';
    chart.replaceChildren(el('p', 'placeholder mono', 'Consulte um usuário para ver a contagem anual.'));
    chart.scrollLeft = 0;
    updateYearNavigation();
    $('timeline-groups').replaceChildren();
    $('timeline-empty').hidden = true;
    $('timeline-idle').hidden = false;
  }

  function jumpToYear(year, bar) {
    const group = $(`ano-${year}`);
    if (!group) return;
    for (const other of $('year-chart').children) other.classList.remove('is-active');
    for (const other of $('timeline-groups').children) other.classList.remove('is-active');
    bar.classList.add('is-active');
    group.classList.add('is-active');
    group.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    const heading = group.children[0]?.children[0];
    if (heading) heading.focus({ preventScroll: true });
  }

  function renderChart(summary) {
    if (summary.length === 0) {
      chart.replaceChildren(el('p', 'placeholder mono', 'Nenhum ano com repositórios públicos.'));
      updateYearNavigation();
      return;
    }
    const max = Math.max(1, ...summary.map((s) => s.count));
    const bars = summary.map(({ year, count }, i) => {
      const bar = el('button', 'bar');
      bar.setAttribute('type', 'button');
      bar.setAttribute('data-year', String(year));
      bar.setAttribute('aria-label', `${year}: ${plural(count, 'repositório', 'repositórios')}. Ir para o ano.`);
      const fill = el('span', 'bar__fill');
      fill.setAttribute('aria-hidden', 'true');
      fill.style.setProperty('--bar-h', `${Math.max(4, (count / max) * 82)}%`);
      fill.style.setProperty('--bar-delay', `${Math.min(i, 12) * 70}ms`);
      bar.append(el('span', 'bar__count', String(count).padStart(2, '0')), fill, el('span', 'bar__year', String(year)));
      bar.addEventListener('click', () => jumpToYear(year, bar));
      return bar;
    });
    chart.replaceChildren(...bars);
    chart.scrollLeft = 0;
    updateYearNavigation();
  }

  function renderRepo(repo) {
    const href = safeRepoUrl(repo.url);
    const item = el('li');
    const card = el(href ? 'a' : 'div', `repo${repo.isFork ? ' repo--fork' : ''}`);
    if (href) {
      card.setAttribute('href', href);
      card.setAttribute('target', '_blank');
      card.setAttribute('rel', 'noopener noreferrer');
    }
    const dot = el('span', 'repo__dot');
    dot.setAttribute('aria-hidden', 'true');

    const time = el('time', 'repo__date', formatDate(repo.createdAt));
    time.setAttribute('datetime', repo.createdAt);
    const meta = el('span', 'repo__meta');
    meta.append(time, el('span', 'repo__index', `#${String(repo.index).padStart(3, '0')}`));
    if (repo.isFork) meta.appendChild(el('span', 'repo__fork', 'fork'));

    const desc = repo.description
      ? el('span', 'repo__desc', repo.description)
      : el('span', 'repo__desc repo__desc--empty', 'Sem descrição.');

    const body = el('span', 'repo__body');
    body.append(meta, el('span', 'repo__name', repo.name), desc);
    if (href) body.appendChild(el('span', 'repo__cta', 'Abrir no GitHub ↗'));
    card.append(dot, body);
    item.appendChild(card);
    return item;
  }

  function renderGroups(repositories) {
    const groups = groupByYear(repositories).map(({ year, repositories: repos }) => {
      const section = el('section', 'year-group');
      section.setAttribute('id', `ano-${year}`);
      section.setAttribute('data-year', String(year));
      section.setAttribute('aria-labelledby', `ano-${year}-titulo`);

      const heading = el('h3', 'year-group__year', String(year));
      heading.setAttribute('id', `ano-${year}-titulo`);
      heading.setAttribute('tabindex', '-1');
      const head = el('div', 'year-group__head');
      head.append(heading, el('p', 'year-group__count', `${String(repos.length).padStart(2, '0')} ${repos.length === 1 ? 'repositório' : 'repositórios'}`));

      const list = el('ol', 'year-group__list');
      list.append(...repos.map(renderRepo));
      section.append(head, list);
      return section;
    });
    $('timeline-groups').replaceChildren(...groups);
  }

  function render(data) {
    const forks = data.repositories.filter((r) => r.isFork).length;
    const years = data.summaryByYear;
    $('profile-username').textContent = `@${data.username}`;
    $('stat-total').textContent = String(data.total);
    $('stat-originals').textContent = String(data.total - forks);
    $('stat-forks').textContent = String(forks);
    $('stat-years').textContent = String(years.length);
    const first = years[0];
    const last = years[years.length - 1];
    $('range-label').textContent = !first ? '—' : first.year === last.year ? String(first.year) : `${first.year} → ${last.year}`;

    renderChart(years);
    renderGroups(data.repositories);
    $('timeline-idle').hidden = true;
    $('timeline-empty').hidden = data.total !== 0;
    setState(data.total === 0 ? 'empty' : 'ready');
    announce(`Timeline de @${data.username} carregada: ${plural(data.total, 'repositório público', 'repositórios públicos')}.`);
    setCaption(plural(data.total, 'repositório mapeado', 'repositórios mapeados'));
    notifyMotion('showResult', data.total);
    notifyMotion('revealChart', $('year-chart'));
    notifyMotion('refresh');
  }

  // Consulta a API local. Cada chamada invalida a anterior: respostas atrasadas são descartadas.
  async function load(rawLogin) {
    const login = String(rawLogin ?? '').trim();
    const requestId = ++currentRequest;
    controller?.abort();
    controller = null;
    clearError();

    if (!isValidUsername(login)) {
      setLoading(false);
      log('✕', timelinePath(login), 'validação local', 'error');
      showError('INVALID_USERNAME', null);
      return;
    }

    const path = timelinePath(login);
    const ownController = new AbortController();
    controller = ownController;
    setLoading(true);
    setState('loading');
    announce(`Consultando @${login}…`);
    setCaption('mapeando repositórios…');
    const settle = log('GET', path, '…');
    const isStale = () => requestId !== currentRequest;

    try {
      let response;
      try {
        response = await fetchImpl(path, { headers: { Accept: 'application/json' }, signal: ownController.signal });
      } catch {
        if (isStale()) return;
        settle('rede', 'error');
        showError('NETWORK_ERROR');
        return;
      }

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      if (isStale()) return;
      setLoading(false);

      if (response.ok) {
        const data = parseTimeline(body);
        if (!data) {
          settle(`${response.status} · inválido`, 'error');
          showError('UNEXPECTED_RESPONSE', response.status);
          return;
        }
        settle(`${response.status} · ${data.total}`, 'ok');
        render(data);
        return;
      }

      settle(String(response.status), 'error');
      const expected = CODE_BY_STATUS[response.status];
      const code = body?.error?.code;
      showError(expected && (code === expected || code === undefined) ? expected : 'UNEXPECTED_RESPONSE', response.status);
    } finally {
      if (!isStale()) {
        setLoading(false);
        controller = null;
      }
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (loading) return;
    load(input.value);
  });

  return { load };
}

// ---------- Movimento progressivo (Tarefa 11, CA-15) ----------
// Canvas decorativo com partículas triangulares que formam a marca do GitHub, como no protótipo.
// Só substitui o SVG estático quando o canvas 2D funciona e não há prefers-reduced-motion.

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const NARROW_WIDTH = 720;
const PALETTE = ['#8052ff', '#8052ff', '#a77bff', '#ffb829', '#1fb393', '#ff5fd2', '#4f8bff'];
const MARK_PATH = 'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z';

// Fração da timeline já lida: 0 antes de o topo cruzar o meio da tela, 1 ao fim. Tolera timeline ausente/vazia.
export function readingProgress(rect, viewportHeight) {
  if (!rect || !Number.isFinite(rect.top) || !Number.isFinite(viewportHeight)) return 0;
  const height = Math.max(1, Number.isFinite(rect.height) ? rect.height : 0);
  return Math.min(1, Math.max(0, (viewportHeight * 0.5 - rect.top) / height));
}

// Limita pixels e partículas pelo tamanho do canvas; telas estreitas recebem menos de ambos.
export function particleBudget({ width, height, dpr }) {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  const narrow = w < NARROW_WIDTH;
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(dpr, narrow ? 1.5 : 2) : 1;
  const count = Math.min(narrow ? 480 : 1300, Math.round((w * h) / 300));
  return { count, dpr: ratio };
}

export function createMotion({ window: win, document: doc }) {
  const canvas = doc.getElementById('hero-canvas');
  const visual = canvas?.parentNode ?? null;
  const progress = doc.getElementById('read-progress');
  const media = win.matchMedia?.(REDUCED_MOTION_QUERY) ?? null;
  const reduced = () => Boolean(media?.matches);

  let ctx = null;
  let canvasFailed = false;
  let markPoints = [];
  let particles = [];
  let width = 0;
  let height = 0;
  let frame = 0;
  let paused = false;
  let destroyed = false;
  let energy = 1;
  let energyTarget = 1;
  let angle = 0;
  let burst = 0;
  let highlight = 0;
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let revealObserver = null;
  const pendingCharts = new Set();

  function updateProgress() {
    if (!progress) return;
    const rect = doc.getElementById('timeline')?.getBoundingClientRect?.() ?? null;
    progress.style.transform = `scaleX(${readingProgress(rect, win.innerHeight)})`;
  }

  // Amostra a silhueta da marca num canvas fora da tela; pontos em coordenadas [-1, 1].
  function sampleMark() {
    const size = 160;
    const off = doc.createElement('canvas');
    off.width = size;
    off.height = size;
    const g = off.getContext('2d');
    g.scale(size / 16, size / 16);
    g.fill(new win.Path2D(MARK_PATH));
    const data = g.getImageData(0, 0, size, size).data;
    const points = [];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (data[(y * size + x) * 4 + 3] > 128) points.push([(x / size) * 2 - 1, (y / size) * 2 - 1]);
      }
    }
    return points;
  }

  function buildParticles(n) {
    const list = [];
    for (let i = 0; i < n; i += 1) {
      const ambient = Math.random() < 0.16;
      let x;
      let y;
      let z;
      if (ambient) {
        x = (Math.random() - 0.5) * 3.2;
        y = (Math.random() - 0.5) * 2.4;
        z = (Math.random() - 0.5) * 2;
      } else {
        const m = markPoints[(Math.random() * markPoints.length) | 0];
        x = m[0] * 1.05 + (Math.random() - 0.5) * 0.02;
        y = m[1] * 1.05 + (Math.random() - 0.5) * 0.02;
        z = (Math.random() - 0.5) * 0.22;
      }
      list.push({
        x, y, z, ambient,
        color: PALETTE[(Math.random() * PALETTE.length) | 0],
        size: 1.6 + Math.random() * 3.6,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.03,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return list;
  }

  function resizeCanvas() {
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const budget = particleBudget({ width: rect.width, height: rect.height, dpr: win.devicePixelRatio });
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * budget.dpr);
    canvas.height = Math.round(height * budget.dpr);
    ctx.setTransform(budget.dpr, 0, 0, budget.dpr, 0, 0);
    if (budget.count !== particles.length) particles = buildParticles(budget.count);
  }

  // Inicializa o canvas só quando for animar; qualquer falha mantém o SVG estático para sempre.
  function ensureCanvas() {
    if (ctx) return true;
    if (!canvas || canvasFailed) return false;
    try {
      const context = canvas.getContext?.('2d');
      if (!context || typeof win.Path2D !== 'function') throw new Error('canvas 2D indisponível');
      markPoints = sampleMark();
      if (markPoints.length === 0) throw new Error('marca vazia');
      ctx = context;
      resizeCanvas();
      return true;
    } catch {
      canvasFailed = true;
      ctx = null;
      return false;
    }
  }

  function draw(t) {
    if (!ctx || !width || !height) return;
    ctx.clearRect(0, 0, width, height);
    energy += (energyTarget - energy) * 0.04;
    burst *= 0.965;
    pointer.sx += (pointer.x - pointer.sx) * 0.05;
    pointer.sy += (pointer.y - pointer.sy) * 0.05;
    angle += 0.0018 * energy;
    const a = Math.sin(angle * 1.6) * 0.45 + pointer.sx * 0.9;
    const b = Math.sin(angle * 1.1) * 0.12 + pointer.sy * 0.6;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const cb = Math.cos(b);
    const sb = Math.sin(b);
    const radius = Math.min(width * 0.46, height * 0.5) * 0.82;
    const cx = width * 0.52;
    const cy = height * 0.48;
    const time = t / 1000;
    const wobble = (energy - 1) * 0.02;
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const k = 1 + 0.025 * Math.sin(time * 1.3 + p.phase)
        + (p.ambient ? 0 : burst * 0.35 * (0.5 + Math.sin(p.phase)))
        + wobble * Math.sin(time * 6 + p.phase);
      const x = p.x * k;
      const y = p.y * k;
      const z = p.z * k;
      const x1 = x * ca - z * sa;
      const z1 = x * sa + z * ca;
      const y1 = y * cb - z1 * sb;
      const z2 = y * sb + z1 * cb;
      const persp = 2.8 / (2.8 + z2);
      const sx = cx + x1 * radius * persp;
      const sy = cy + y1 * radius * persp;
      p.rot += p.spin * energy;
      if (sx < -10 || sx > width + 10 || sy < -10 || sy > height + 10) continue;
      const lit = i < highlight && !p.ambient;
      const alpha = Math.max(0.08, Math.min(1, 0.95 - (z2 + 1) * 0.38));
      const size = p.size * persp * (lit ? 1.7 : 1);
      ctx.globalAlpha = p.ambient ? alpha * 0.45 : alpha;
      ctx.beginPath();
      for (let j = 0; j < 3; j += 1) {
        const an = p.rot + j * 2.0944;
        const px = sx + Math.cos(an) * size;
        const py = sy + Math.sin(an) * size;
        if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (lit) {
        ctx.fillStyle = '#ffb829';
        ctx.fill();
      } else {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  const canAnimate = () => !destroyed && !paused && !reduced() && doc.visibilityState !== 'hidden';

  function tick(t) {
    frame = 0;
    // `matches` pode mudar sem evento `change` (ex.: emulação via CDP); aplica o modo estático aqui.
    if (reduced()) {
      applyReducedMotion();
      return;
    }
    if (!canAnimate()) return;
    draw(t);
    frame = win.requestAnimationFrame(tick);
  }

  // Idempotente: nunca agenda mais de um quadro por vez.
  function start() {
    if (frame || !canAnimate() || !ensureCanvas()) return;
    visual?.classList.add('has-canvas');
    frame = win.requestAnimationFrame(tick);
  }

  function stop() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
  }

  // Volta ao SVG estático (reduced motion ou destruição).
  function hideCanvas() {
    stop();
    ctx?.clearRect(0, 0, width, height);
    visual?.classList.remove('has-canvas');
  }

  function reveal(chart) {
    chart.classList.remove('is-pending');
    pendingCharts.delete(chart);
    revealObserver?.unobserve(chart);
  }

  function revealAll() {
    for (const chart of [...pendingCharts]) reveal(chart);
  }

  // Barras só começam ocultas se houver IntersectionObserver e movimento permitido.
  function revealChart(chart) {
    if (!chart) return;
    const Observer = win.IntersectionObserver;
    if (destroyed || reduced() || typeof Observer !== 'function') {
      reveal(chart);
      return;
    }
    try {
      revealObserver ??= new Observer((entries) => {
        for (const entry of entries) if (entry.isIntersecting) reveal(entry.target);
      }, { rootMargin: '0px 0px -12% 0px', threshold: 0.15 });
      chart.classList.add('is-pending');
      pendingCharts.add(chart);
      revealObserver.unobserve(chart);
      revealObserver.observe(chart);
    } catch {
      reveal(chart);
    }
  }

  function applyReducedMotion() {
    hideCanvas();
    revealAll();
  }

  const onScroll = () => updateProgress();
  // `start` é idempotente; retoma a animação se reduced motion foi desativado sem evento.
  const onResize = () => {
    updateProgress();
    resizeCanvas();
    start();
  };
  const onVisibility = () => (doc.visibilityState === 'hidden' ? stop() : start());
  const onPageHide = () => {
    paused = true;
    stop();
  };
  const onPageShow = () => {
    paused = false;
    start();
  };
  const onMotionPreference = () => {
    if (reduced()) {
      applyReducedMotion();
    } else {
      start();
    }
  };
  const onPointerMove = (event) => {
    if (!width || !height || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width - 0.5;
    pointer.y = (event.clientY - rect.top) / rect.height - 0.5;
  };
  const onPointerLeave = () => {
    pointer.x = 0;
    pointer.y = 0;
  };

  win.addEventListener('scroll', onScroll, { passive: true });
  win.addEventListener('resize', onResize);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  doc.addEventListener?.('visibilitychange', onVisibility);
  if (media?.addEventListener) media.addEventListener('change', onMotionPreference);
  else media?.addListener?.(onMotionPreference);
  visual?.addEventListener?.('pointermove', onPointerMove);
  visual?.addEventListener?.('pointerleave', onPointerLeave);

  updateProgress();
  start();

  return {
    setLoading(on) {
      energyTarget = on ? 5 : 1;
    },
    showResult(total) {
      burst = 1;
      highlight = Math.min(Math.max(0, Number(total) || 0), 260);
    },
    revealChart,
    refresh: updateProgress,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      hideCanvas();
      revealAll();
      revealObserver?.disconnect();
      revealObserver = null;
      win.removeEventListener('scroll', onScroll);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('pagehide', onPageHide);
      win.removeEventListener('pageshow', onPageShow);
      doc.removeEventListener?.('visibilitychange', onVisibility);
      if (media?.removeEventListener) media.removeEventListener('change', onMotionPreference);
      else media?.removeListener?.(onMotionPreference);
      visual?.removeEventListener?.('pointermove', onPointerMove);
      visual?.removeEventListener?.('pointerleave', onPointerLeave);
    },
  };
}

// Inicialização no navegador; em Node (testes) não há `document` e nada é executado.
// O movimento é opcional: se falhar, a consulta à API continua funcionando.
if (typeof document !== 'undefined' && document.getElementById('timeline-form')) {
  let motion = null;
  try {
    motion = createMotion({ window, document });
  } catch {
    motion = null;
  }
  createTimelineApp({
    document,
    fetch: (...args) => globalThis.fetch(...args),
    prefersReducedMotion: () => window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false,
    motion,
  });
}
