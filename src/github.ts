// Cliente GitHub (Tarefas 3-4): busca de perfil via /users/:username, classificação de erros (CA-8, CA-9)
// e paginação de /users/:username/repos seguindo Link rel="next" (CA-2).
export type GithubAccountType = 'User' | 'Organization';

export interface GithubProfile {
  login: string;
  type: GithubAccountType;
}

export type GithubErrorCode =
  | 'USER_NOT_FOUND'
  | 'ORGANIZATION_NOT_SUPPORTED'
  | 'GITHUB_RATE_LIMITED'
  | 'GITHUB_UNAVAILABLE';

export class GithubClientError extends Error {
  readonly code: GithubErrorCode;

  constructor(code: GithubErrorCode, message: string) {
    super(message);
    this.name = 'GithubClientError';
    this.code = code;
  }
}

const GITHUB_API_BASE_URL = 'https://api.github.com';

function buildRequestHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'github-timeline',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function isRateLimitedForbidden(response: Response): boolean {
  return response.headers.get('x-ratelimit-remaining') === '0';
}

function isSecondaryRateLimitForbidden(response: Response): boolean {
  return response.headers.get('retry-after') !== null;
}

function hasRateLimitMessage(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const message = (body as Record<string, unknown>).message;
  return typeof message === 'string' && message.toLowerCase().includes('rate limit');
}

async function parseJsonBody(response: Response): Promise<{ ok: true; value: unknown } | { ok: false }> {
  try {
    return { ok: true, value: await response.json() };
  } catch {
    return { ok: false };
  }
}

function isGithubProfile(body: unknown): body is { login: string; type: GithubAccountType } {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const record = body as Record<string, unknown>;
  return typeof record.login === 'string' && (record.type === 'User' || record.type === 'Organization');
}

export async function fetchGithubUser(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubProfile> {
  let response: Response;
  try {
    response = await fetchImpl(`${GITHUB_API_BASE_URL}/users/${username}`, {
      headers: buildRequestHeaders(),
    });
  } catch {
    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Falha de rede ao consultar a API do GitHub.');
  }

  if (response.status === 404) {
    throw new GithubClientError('USER_NOT_FOUND', 'Conta GitHub não encontrada.');
  }

  if (response.status === 429) {
    throw new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
  }

  if (response.status === 403) {
    if (isRateLimitedForbidden(response) || isSecondaryRateLimitForbidden(response)) {
      throw new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
    }

    const parsed = await parseJsonBody(response);
    if (parsed.ok && hasRateLimitMessage(parsed.value)) {
      throw new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
    }

    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Falha ao consultar a API do GitHub.');
  }

  if (!response.ok) {
    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Falha ao consultar a API do GitHub.');
  }

  const parsedBody = await parseJsonBody(response);
  if (!parsedBody.ok || !isGithubProfile(parsedBody.value)) {
    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Resposta inválida da API do GitHub.');
  }

  const body = parsedBody.value;

  if (body.type === 'Organization') {
    throw new GithubClientError('ORGANIZATION_NOT_SUPPORTED', 'Contas de organização não são suportadas.');
  }

  return { login: body.login, type: body.type };
}

export interface GithubRepo {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  html_url: string;
  fork: boolean;
  private: boolean;
}

const GITHUB_API_HOSTNAME = new URL(GITHUB_API_BASE_URL).hostname;

function isGithubRepo(item: unknown): item is GithubRepo {
  if (typeof item !== 'object' || item === null) {
    return false;
  }
  const record = item as Record<string, unknown>;
  return (
    typeof record.id === 'number' &&
    typeof record.name === 'string' &&
    (typeof record.description === 'string' || record.description === null) &&
    typeof record.created_at === 'string' &&
    typeof record.html_url === 'string' &&
    typeof record.fork === 'boolean' &&
    typeof record.private === 'boolean'
  );
}

function isGithubRepoArray(body: unknown): body is GithubRepo[] {
  return Array.isArray(body) && body.every(isGithubRepo);
}

async function classifyRepoPageFailure(response: Response): Promise<GithubClientError> {
  if (response.status === 429) {
    return new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
  }

  if (response.status === 403) {
    if (isRateLimitedForbidden(response) || isSecondaryRateLimitForbidden(response)) {
      return new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
    }

    const parsed = await parseJsonBody(response);
    if (parsed.ok && hasRateLimitMessage(parsed.value)) {
      return new GithubClientError('GITHUB_RATE_LIMITED', 'Limite de requisições do GitHub atingido.');
    }
  }

  return new GithubClientError('GITHUB_UNAVAILABLE', 'Falha ao consultar a API do GitHub.');
}

const NUMERIC_USER_REPOS_PATH = /^\/user\/(\d+)\/repos$/;

interface NextLink {
  url: string;
  numericUserId: string | null;
}

function parseNextLinkUrl(linkHeader: string | null, username: string, lockedNumericUserId: string | null): NextLink | null {
  if (!linkHeader) {
    return null;
  }

  const expectedLegacyPath = `/users/${username}/repos`;

  for (const part of linkHeader.split(',')) {
    const match = part.trim().match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (!match || match[2] !== 'next') {
      continue;
    }

    const rawUrl = match[1];
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      throw new GithubClientError('GITHUB_UNAVAILABLE', 'Link de paginação inválido na resposta do GitHub.');
    }

    if (
      parsedUrl.protocol !== 'https:' ||
      parsedUrl.hostname !== GITHUB_API_HOSTNAME ||
      parsedUrl.port !== '' ||
      parsedUrl.username !== '' ||
      parsedUrl.password !== ''
    ) {
      throw new GithubClientError('GITHUB_UNAVAILABLE', 'Link de paginação inválido na resposta do GitHub.');
    }

    if (parsedUrl.pathname === expectedLegacyPath) {
      return { url: rawUrl, numericUserId: lockedNumericUserId };
    }

    const numericMatch = parsedUrl.pathname.match(NUMERIC_USER_REPOS_PATH);
    if (numericMatch) {
      const numericUserId = numericMatch[1];
      if (lockedNumericUserId !== null && numericUserId !== lockedNumericUserId) {
        throw new GithubClientError('GITHUB_UNAVAILABLE', 'Link de paginação inválido na resposta do GitHub.');
      }
      return { url: rawUrl, numericUserId };
    }

    throw new GithubClientError('GITHUB_UNAVAILABLE', 'Link de paginação inválido na resposta do GitHub.');
  }

  return null;
}

export async function fetchGithubRepos(
  username: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GithubRepo[]> {
  const repos: GithubRepo[] = [];
  const visitedUrls = new Set<string>();
  let nextUrl: string | null = `${GITHUB_API_BASE_URL}/users/${username}/repos?per_page=100&type=all`;
  let lockedNumericUserId: string | null = null;

  while (nextUrl !== null) {
    if (visitedUrls.has(nextUrl)) {
      throw new GithubClientError('GITHUB_UNAVAILABLE', 'Paginação inválida da API do GitHub.');
    }
    visitedUrls.add(nextUrl);

    let response: Response;
    try {
      response = await fetchImpl(nextUrl, { headers: buildRequestHeaders() });
    } catch {
      throw new GithubClientError('GITHUB_UNAVAILABLE', 'Falha de rede ao consultar a API do GitHub.');
    }

    if (!response.ok) {
      throw await classifyRepoPageFailure(response);
    }

    const parsedBody = await parseJsonBody(response);
    if (!parsedBody.ok || !isGithubRepoArray(parsedBody.value)) {
      throw new GithubClientError('GITHUB_UNAVAILABLE', 'Resposta inválida da API do GitHub.');
    }

    repos.push(...parsedBody.value.filter((repo) => !repo.private));
    const next = parseNextLinkUrl(response.headers.get('link'), username, lockedNumericUserId);
    nextUrl = next?.url ?? null;
    lockedNumericUserId = next?.numericUserId ?? lockedNumericUserId;
  }

  return repos;
}
